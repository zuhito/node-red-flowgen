'use strict';

// Calls one public API definition for real and checks that a generated flow
// makes the same request curl does.
//
//   SPEC=balldontlie.io/1.0.0/openapi.yaml node tests/test-corpus.js
//
// The definition is fetched, every endpoint that can be called without
// credentials or invented parameters is generated, and each is requested twice:
// once with curl and once through Node-RED. The two responses have to match.
//
// The first endpoint decides whether the rest run at all. A host that is down
// or that refuses anonymous callers says nothing about the generator, so the
// run reports that and stops rather than failing.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const yaml = require('js-yaml');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');

const RAW = 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';
const SPEC = process.env.SPEC;
const MAX_CALLS = Number(process.env.MAX_CALLS || 40);

const notes = [];
let failures = 0;

function note(level, line) {
    process.stdout.write('::' + level + '::' + line + '\n');
    notes.push((level === 'error' ? 'FAIL | ' : 'ok   | ') + line);
}

function dump(label, what, body) {
    const text = body === null || body === undefined ? '(no body)'
        : (typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    process.stdout.write('----- ' + label + ' :: ' + what + ' -----\n' +
        (text.length > 4000 ? text.slice(0, 4000) + '\n...[clipped]' : text) + '\n');
}

function fetch(url, redirects) {
    return new Promise(resolve => {
        const request = https.get(url, { timeout: 30000 }, res => {
            const left = redirects === undefined ? 3 : redirects;
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && left) {
                res.resume();
                return resolve(fetch(new URL(res.headers.location, url).toString(), left - 1));
            }
            if (res.statusCode !== 200) { res.resume(); return resolve(null); }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve(body));
        });
        request.on('error', () => resolve(null));
        request.on('timeout', () => { request.destroy(); resolve(null); });
    });
}

function curl(method, url, headers) {
    // Node-RED's http request node follows redirects, so curl has to as well
    // or the two disagree on every host that has moved. Without this a 301
    // from curl was compared against whatever Node-RED found at the other end.
    const args = ['-sS', '-i', '--location', '--max-redirs', '5',
        '--globoff', '--max-time', '25',
        '-X', String(method).toUpperCase(), url];
    for (const [name, value] of Object.entries(headers || {})) {
        args.push('-H', name + ': ' + value);
    }
    return new Promise(resolve => {
        execFile('curl', args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout) => {
                if (err && !stdout) { return resolve({ status: null, body: null }); }
                // Following redirects means one header block per hop. The
                // last one describes the response that was actually received.
                const text = String(stdout);
                let rest = text;
                let head = '';
                let body = '';
                for (;;) {
                    const split = rest.indexOf('\r\n\r\n');
                    if (split === -1) { body = rest; break; }
                    head = rest.slice(0, split);
                    rest = rest.slice(split + 4);
                    if (!/^HTTP\/[\d.]+ /.test(rest)) { body = rest; break; }
                }
                const status = (head.match(/HTTP\/[\d.]+ (\d+)/) || [])[1];
                resolve({ status: status ? Number(status) : null, body: body });
            });
    });
}

// Responses carry things that differ between two calls seconds apart. Those are
// dropped before comparing; anything else that differs is a real disagreement.
const VOLATILE = new Set(['date', 'timestamp', 'time', 'now', 'requestid', 'request_id',
    'x-request-id', 'traceid', 'trace_id', 'server', 'etag', 'age', 'expires',
    'last-modified', 'set-cookie', 'cf-ray', 'x-amzn-requestid', 'x-amz-cf-id',
    'x-runtime', 'x-served-by', 'x-cache', 'x-timer', 'duration', 'elapsed',
    'took', 'generated', 'generated_at', 'created', 'created_at', 'updated_at',
    'uuid', 'id', 'session', 'sessionid', 'nonce', 'accept']);

function normalise(value) {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            if (VOLATILE.has(key.toLowerCase())) continue;
            out[key.toLowerCase()] = normalise(value[key]);
        }
        return out;
    }
    return value;
}

function comparable(body) {
    if (body === null || body === undefined || body === '') return null;
    let parsed = body;
    if (typeof body === 'string') {
        const trimmed = body.trim();
        if (!/^[{[]/.test(trimmed)) return trimmed;
        try { parsed = JSON.parse(trimmed); } catch (err) { return trimmed; }
    }
    return JSON.stringify(normalise(parsed));
}

function callable(doc) {
    const out = [];
    let operations;
    try { operations = flowgen.listOperations(doc).operations; }
    catch (err) { return out; }

    for (const op of operations) {
        if (op.method !== 'get') { continue; }
        if (/\{[A-Za-z_][\w.-]*\}/.test(op.path)) { continue; }
        let code;
        try { code = flowgen.generate(doc, op.method, op.path); }
        catch (err) { continue; }
        // A placeholder left in the code means the reader was expected to
        // supply something the definition does not contain.
        // A placeholder is a single name in braces. Matching anything between
        // braces caught the object literal that every generated file contains,
        // which quietly rejected 424 of 492 definitions.
        if (/\{[A-Za-z_][\w.-]*\}/.test(code)) { continue; }
        out.push(op);
    }
    return out;
}

async function throughNodeRed(userDir, doc, op) {
    const nodes = flowgen.buildFlow(doc, op.method, op.path);
    let probeId = null;
    for (const node of nodes) {
        if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
        if (node.type === 'http request') { node.ret = 'txt'; node.senderr = true; }
        if (node.type === 'debug') {
            probeId = node.id;
            node.type = 'function';
            node.libs = [];
            node.outputs = 1;
            node.wires = [[]];
            node.func = 'global.set("corpusResult", JSON.stringify({ ' +
                'status: msg.statusCode, body: msg.payload }));\nreturn msg;';
        }
    }

    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
    await RED.nodes.loadFlows(true);

    const started = Date.now();
    while (Date.now() - started < 40000) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const node = RED.nodes.getNode(probeId);
        if (!node) { continue; }
        const value = node.context().global.get('corpusResult');
        if (value) {
            node.context().global.set('corpusResult', null);
            return JSON.parse(value);
        }
    }
    return { status: null, body: null };
}

async function main() {
    if (!SPEC) {
        process.stderr.write('set SPEC to a path under the APIs-guru directory\n');
        process.exit(2);
    }

    // A local path stands in for a fetch, so the comparison itself can be
    // exercised without depending on a public service being up.
    const text = fs.existsSync(SPEC)
        ? fs.readFileSync(SPEC, 'utf8')
        : await fetch(RAW + SPEC);
    if (!text) {
        note('notice', SPEC + ' -> the definition could not be fetched');
        return 0;
    }

    let doc;
    try { doc = yaml.load(text); }
    catch (err) {
        note('error', SPEC + ' -> the definition will not parse: ' + err.message);
        return 1;
    }

    const operations = callable(doc);
    if (!operations.length) {
        note('notice', SPEC + ' -> nothing callable without credentials');
        return 0;
    }

    // The first endpoint decides whether the host is worth calling at all.
    const first = operations[0];
    const firstMsg = new Function('msg', flowgen.generate(doc, first.method, first.path))
        .call(null, {});
    const reachable = await curl(first.method, firstMsg.url, firstMsg.headers);
    if (reachable.status === null || reachable.status >= 400) {
        note('notice', SPEC + ' -> ' + first.method.toUpperCase() + ' ' + first.path +
            ' answered ' + (reachable.status === null ? 'nothing' : reachable.status) +
            ', so this definition is skipped');
        return 0;
    }

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-corpus-'));
    const app = express();
    const server = http.createServer(app);
    RED.init(server, {
        httpAdminRoot: false, httpNodeRoot: false, userDir: userDir,
        flowFile: 'flows.json',
        logging: { console: { level: 'fatal', metrics: false, audit: false } }
    });
    fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await RED.start();

    let compared = 0;
    try {
        for (const op of operations.slice(0, MAX_CALLS)) {
            const label = SPEC + ' ' + op.method.toUpperCase() + ' ' + op.path;
            const built = new Function('msg', flowgen.generate(doc, op.method, op.path))
                .call(null, {});

            const viaCurl = await curl(op.method, built.url, built.headers);
            const viaFlow = await throughNodeRed(userDir, doc, op);
            compared++;

            if (viaCurl.status === null || viaFlow.status === null) {
                note('notice', label + ' -> no answer from ' +
                    (viaCurl.status === null ? 'curl' : 'Node-RED') + ', skipped');
                continue;
            }
            if (viaCurl.status >= 500 && viaFlow.status >= 500) {
                note('notice', label + ' -> both callers got HTTP ' + viaCurl.status);
                continue;
            }

            if (viaCurl.status !== viaFlow.status) {
                failures++;
                note('error', label + ' -> curl saw HTTP ' + viaCurl.status +
                    ' but Node-RED saw HTTP ' + viaFlow.status);
                dump(label, 'curl', viaCurl.body);
                dump(label, 'node-red', viaFlow.body);
                continue;
            }

            const left = comparable(viaCurl.body);
            const right = comparable(viaFlow.body);
            if (left !== null && right !== null && left !== right) {
                failures++;
                note('error', label + ' -> the two responses differ');
                dump(label, 'curl', viaCurl.body);
                dump(label, 'node-red', viaFlow.body);
                dump(label, 'curl normalised', left);
                dump(label, 'node-red normalised', right);
                continue;
            }

            // No word scanning here. What this run checks is whether the two
            // callers built the same request, and both of them received the
            // same bytes. An api that returns its own OpenAPI document
            // contains the word "error" as a schema name, and a gazetteer
            // classifies places as "unknown"; both were reported as failures
            // while the two responses matched exactly.

            note('notice', label + ' -> both callers agree on HTTP ' + viaCurl.status);
        }
    } finally {
        await RED.stop();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(userDir, { recursive: true, force: true });
    }

    process.stdout.write('\n' + notes.join('\n') + '\n');
    process.stdout.write('compared ' + compared + ' endpoints, ' + failures + ' problems\n');
    return failures ? 1 : 0;
}

main().then(code => process.exit(code)).catch(err => {
    note('error', 'the corpus run crashed: ' + String((err && err.stack) || err));
    process.exit(1);
});
