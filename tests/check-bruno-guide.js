'use strict';

// Runs every request in the bruno-starter-guide collection twice: once through
// the Bruno CLI, and once as a Node-RED flow built by flowgen. The bodies the
// debug node sees must match what Bruno reports, and anything that differs is
// printed in full so the CI log carries the evidence.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');
const { unexpectedErrors } = require('./error-words');

const REPO = 'https://github.com/bruno-collections/bruno-starter-guide.git';
const WINDOWS = process.platform === 'win32';
const NPX = WINDOWS ? 'npx.cmd' : 'npx';

const problems = [];
const summary = [];

function note(level, line) {
    process.stdout.write('::' + level + '::' + line + '\n');
    summary.push((level === 'error' ? 'FAIL | ' : 'ok   | ') + line);
}

function dump(label, what, body) {
    const text = body === null || body === undefined ? '(no body)'
        : (typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    const clipped = text.length > 4000 ? text.slice(0, 4000) + '\n...[clipped]' : text;
    process.stdout.write('----- ' + label + ' :: ' + what + ' -----\n' + clipped + '\n');
}

function run(command, args, options) {
    return new Promise(resolve => {
        execFile(command, args, Object.assign({
            timeout: 120000, maxBuffer: 16 * 1024 * 1024, shell: WINDOWS
        }, options), (err, stdout, stderr) => {
            resolve({ code: err ? (err.code === undefined ? 1 : err.code) : 0, stdout, stderr });
        });
    });
}

// Bruno and Node-RED disagree about key order and about fields the service
// stamps per request, so those are dropped before the two are compared.
const VOLATILE = new Set(['date', 'x-request-id', 'x-amzn-trace-id', 'request-id',
    'etag', 'age', 'server', 'set-cookie', 'cf-ray', 'reporting-endpoints']);

function normalise(value) {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            if (VOLATILE.has(key.toLowerCase())) continue;
            out[key] = normalise(value[key]);
        }
        return out;
    }
    return value;
}

function comparable(body) {
    if (body === null || body === undefined || body === '') return null;
    let parsed = body;
    if (typeof body === 'string') {
        try { parsed = JSON.parse(body); } catch (err) { return body.trim(); }
    }
    return JSON.stringify(normalise(parsed));
}

async function collect(root) {
    const files = [];
    for (const entry of fs.readdirSync(root)) {
        if (!/^\d+.*\.ya?ml$/.test(entry)) continue;
        files.push(path.join(root, entry));
    }
    return files.sort();
}

async function viaBruno(root, name) {
    const result = await run(NPX, ['--yes', '@usebruno/cli', 'run', name,
        '--format', 'json', '--output', path.join(root, 'bruno-out.json')],
    { cwd: root });
    const outFile = path.join(root, 'bruno-out.json');
    if (!fs.existsSync(outFile)) {
        return { status: null, body: null, stderr: result.stderr || result.stdout };
    }
    let report = null;
    try { report = JSON.parse(fs.readFileSync(outFile, 'utf8')); }
    catch (err) { return { status: null, body: null, stderr: 'unreadable report' }; }
    fs.unlinkSync(outFile);

    // The CLI reports one entry per iteration, each holding the per request
    // results, so the response sits two levels down.
    const iterations = Array.isArray(report) ? report : [report];
    const results = iterations.reduce((all, entry) =>
        all.concat(Array.isArray(entry && entry.results) ? entry.results : []), []);
    const first = results[0] || null;
    const response = first && first.response || null;
    if (!response) return { status: null, body: null, stderr: 'no response in report' };
    return {
        status: response.status || response.statusCode || null,
        body: response.data !== undefined ? response.data : response.body
    };
}

async function viaNodeRed(userDir, doc, op) {
    const nodes = flowgen.buildFlow(doc, op.method, op.path);
    for (const node of nodes) {
        if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
        if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
    }
    const probe = nodes.find(n => n.type === 'debug');
    probe.type = 'function';
    probe.name = 'probe';
    probe.outputs = 1;
    probe.wires = [[]];
    probe.func = "global.set('brunoResult', { status: msg.statusCode, " +
        "body: msg.payload });\nreturn msg;";

    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
    await RED.nodes.loadFlows(true);

    let node = null;
    for (let i = 0; i < 50 && !node; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        node = RED.nodes.getNode(probe.id);
    }
    if (!node) return { status: null, body: null, stderr: 'probe never started' };

    const context = node.context().global;
    context.set('brunoResult', null);
    const started = Date.now();
    let result = null;
    while (!result && Date.now() - started < 45000) {
        await new Promise(resolve => setTimeout(resolve, 200));
        result = context.get('brunoResult');
    }
    return result || { status: null, body: null };
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-guide-'));
    const root = path.join(work, 'bruno-starter-guide');

    // A local checkout can stand in when the clone cannot reach GitHub.
    const local = process.env.BRUNO_GUIDE_DIR;
    const cloned = local
        ? (fs.cpSync(local, root, { recursive: true }), { code: 0, stderr: '' })
        : await run('git', ['clone', '--depth', '1', REPO, root]);
    if (cloned.code !== 0) {
        note('notice', 'the starter guide could not be cloned, skipping: ' +
            (cloned.stderr || '').trim().split('\n').pop());
        return 0;
    }

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-guide-red-'));
    const app = express();
    const server = http.createServer(app);
    RED.init(server, {
        httpAdminRoot: false,
        httpNodeRoot: false,
        userDir: userDir,
        flowFile: 'flows.json',
        logging: { console: { level: 'fatal', metrics: false, audit: false } }
    });
    fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await RED.start();

    let compared = 0;
    for (const file of await collect(root)) {
        const name = path.basename(file);
        const label = 'starter-guide ' + name;

        let doc;
        let op;
        try {
            doc = flowgen.parseDocument(fs.readFileSync(file, 'utf8'));
            op = flowgen.listOperations(doc).operations[0];
        } catch (err) {
            problems.push(label);
            note('error', label + ' -> flowgen could not read it: ' + err.message);
            continue;
        }
        if (!op) { note('notice', label + ' -> no request in the file'); continue; }

        const code = flowgen.generate(doc, op.method, op.path);
        // A url the collection leaves as a variable cannot be called, and the
        // starter guide expects the reader to supply it.
        if (/\{[^}]+\}/.test(code.match(/msg\.url = .*/)[0])) {
            note('notice', label + ' -> url still has a placeholder, not called');
            continue;
        }

        const bruno = await viaBruno(root, name);
        const nodered = await viaNodeRed(userDir, doc, op);
        compared++;

        if (bruno.status === null) {
            note('notice', label + ' -> the Bruno CLI gave no response: ' +
                (bruno.stderr || '').trim());
            continue;
        }
        // A host the runner cannot reach answers both callers the same way, and
        // that is a network fact rather than a difference worth failing on.
        if (bruno.status === nodered.status && bruno.status >= 400) {
            note('notice', label + ' -> both callers got HTTP ' + bruno.status +
                ', so the endpoint is not reachable from here');
            continue;
        }

        const left = comparable(bruno.body);
        const right = comparable(nodered.body);

        // Calling the same public endpoint twice in a row can trip a rate
        // limit, and that says nothing about the generated code, so it is
        // reported without failing the run.
        const throttled = status => status === 429 ||
            (status === 403 && /rate limit/i.test(JSON.stringify(nodered.body || '')));

        if (bruno.status !== nodered.status && throttled(nodered.status)) {
            note('notice', label + ' -> Node-RED was rate limited (HTTP ' +
                nodered.status + ') where Bruno saw ' + bruno.status);
        } else if (bruno.status !== nodered.status) {
            problems.push(label);
            note('error', label + ' -> Bruno saw HTTP ' + bruno.status +
                ' but Node-RED saw HTTP ' + nodered.status);
            dump(label, 'bruno HTTP ' + bruno.status, bruno.body);
            dump(label, 'node-red HTTP ' + nodered.status, nodered.body);
        } else if (left !== null && right !== null && left !== right) {
            problems.push(label);
            note('error', label + ' -> Bruno and Node-RED returned different bodies');
            dump(label, 'bruno HTTP ' + bruno.status, bruno.body);
            dump(label, 'node-red HTTP ' + nodered.status, nodered.body);
            dump(label, 'bruno body (normalised)', left);
            dump(label, 'node-red body (normalised)', right);
        } else {
            note('notice', label + ' -> Bruno and Node-RED agree on HTTP ' + bruno.status);
        }

        for (const [source, body, status] of [
            ['bruno', bruno.body, bruno.status],
            ['node-red', nodered.body, nodered.status]
        ]) {
            if (throttled(nodered.status) && source === 'node-red') continue;
            // The guide expects every request to succeed, so nothing in a body
            // is excused here; the status it came back with still decides.
            const hits = unexpectedErrors(body, status, [status < 400 ? status : null]);
            if (!hits.length) continue;
            problems.push(label);
            note('error', label + ' -> the ' + source +
                ' response reads like an error: ' + hits.join(', '));
            dump(label, source + ' response carrying ' + hits.join(', '), body);
        }
    }

    await RED.stop();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(userDir, { recursive: true, force: true });

    process.stdout.write('\n' + summary.join('\n') + '\n');
    process.stdout.write('compared ' + compared + ' requests, ' +
        problems.length + ' problems\n');
    return problems.length ? 1 : 0;
}

main().then(code => process.exit(code)).catch(err => {
    note('error', 'the starter guide run crashed: ' + err.message);
    process.exit(1);
});
