'use strict';

// Builds tests/specs/corpus.json: the public API definitions worth calling for
// real. Each entry records where the definition lives and one endpoint that can
// be reached without credentials, which is what decides whether the definition
// earns a CI job at all.
//
//   node tests/build-corpus.js            # refresh from the sources below
//   node tests/build-corpus.js --probe    # also call the first endpoint
//
// Definitions with more than MAX_ENDPOINTS operations are left out: a job that
// makes hundreds of calls tells you little that the first dozen did not, and it
// turns one slow host into a slow build.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const yaml = require('js-yaml');
const flowgen = require('../flowgen');

const RAW = 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';
const OUT = path.join(__dirname, 'specs', 'corpus.json');
const MAX_ENDPOINTS = 256;
const PROBE = process.argv.includes('--probe');

function fetch(url, redirects) {
    return new Promise(resolve => {
        const request = https.get(url, { timeout: 30000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location &&
                    (redirects === undefined ? 3 : redirects) > 0) {
                res.resume();
                return resolve(fetch(new URL(res.headers.location, url).toString(),
                    (redirects === undefined ? 3 : redirects) - 1));
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

// An endpoint worth probing: no path parameters to invent, no body to guess,
// and no credentials. If a definition has none, there is nothing to call
// without knowing more than the definition says.
function probeTarget(doc) {
    let operations;
    try { operations = flowgen.listOperations(doc).operations; }
    catch (err) { return null; }

    for (const op of operations) {
        if (op.method !== 'get') { continue; }
        if (/\{[A-Za-z_][\w.-]*\}/.test(op.path)) { continue; }
        let code;
        try { code = flowgen.generate(doc, op.method, op.path); }
        catch (err) { continue; }
        // A placeholder is a single name in braces. Matching anything between
        // braces caught the object literal that every generated file contains,
        // which quietly rejected 424 of 492 definitions.
        if (/\{[A-Za-z_][\w.-]*\}/.test(code)) { continue; }
        return op;
    }
    return null;
}

// How many endpoints this run will actually call: the ones needing no
// credentials and no invented parameter.
function probeCount(doc) {
    let operations;
    try { operations = flowgen.listOperations(doc).operations; }
    catch (err) { return 0; }
    let count = 0;
    for (const op of operations) {
        if (op.method !== 'get') { continue; }
        if (/\{[A-Za-z_][\w.-]*\}/.test(op.path)) { continue; }
        try {
            if (!/\{[A-Za-z_][\w.-]*\}/.test(flowgen.generate(doc, op.method, op.path))) {
                count++;
            }
        } catch (err) { /* not generatable, so not callable */ }
    }
    return count;
}

function curl(url) {
    return new Promise(resolve => {
        execFile('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--globoff',
            '--max-time', '20', url], { timeout: 25000 }, (err, stdout) => {
            const code = parseInt(String(stdout).trim(), 10);
            resolve(Number.isFinite(code) && code > 0 ? code : null);
        });
    });
}

async function main() {
    const wanted = fs.readFileSync(path.join(__dirname, 'corpus-sources.txt'), 'utf8')
        .split('\n').map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    const kept = [];
    const rejected = [];

    for (const relative of wanted) {
        const url = RAW + relative;
        const text = await fetch(url);
        if (!text) { rejected.push([relative, 'could not be fetched']); continue; }

        let doc;
        try { doc = yaml.load(text); }
        catch (err) { rejected.push([relative, 'not parseable: ' + err.message]); continue; }
        if (!doc || typeof doc !== 'object') {
            rejected.push([relative, 'not a document']);
            continue;
        }

        let count;
        try { count = flowgen.listOperations(doc).count; }
        catch (err) { rejected.push([relative, 'flowgen: ' + err.message]); continue; }
        if (!count) { rejected.push([relative, 'no operations']); continue; }
        if (count > MAX_ENDPOINTS) {
            rejected.push([relative, count + ' endpoints, over the limit']);
            continue;
        }

        const target = probeTarget(doc);
        if (!target) {
            rejected.push([relative, 'nothing callable without credentials or parameters']);
            continue;
        }

        // What the definition is made of, so the progress table can say how
        // this one differed from the rest rather than only that it passed.
        const byMethod = {};
        for (const op of flowgen.listOperations(doc).operations) {
            byMethod[op.method] = (byMethod[op.method] || 0) + 1;
        }
        const callable = probeCount(doc);

        const entry = {
            id: relative.replace(/[^\w.-]+/g, '-').replace(/\.(ya?ml|json)$/, ''),
            spec: relative,
            endpoints: count,
            methods: byMethod,
            callable: callable,
            format: doc.swagger === '2.0' ? 'swagger 2'
                : (doc.openapi ? 'openapi ' + String(doc.openapi).slice(0, 3) : 'unknown'),
            probe: { method: target.method, path: target.path }
        };

        if (PROBE) {
            const msg = new Function('msg', flowgen.generate(doc, target.method, target.path))
                .call(null, {});
            entry.probe.url = msg.url;
            entry.probe.status = await curl(msg.url);
            if (!entry.probe.status || entry.probe.status >= 400) {
                rejected.push([relative, 'probe answered ' +
                    (entry.probe.status === null ? 'nothing' : entry.probe.status)]);
                continue;
            }
        }

        kept.push(entry);
        process.stdout.write('  keep   ' + relative + '  (' + count + ' endpoints, probe ' +
            target.method + ' ' + target.path + ')\n');
    }

    for (const [relative, why] of rejected) {
        process.stdout.write('  drop   ' + relative + '  (' + why + ')\n');
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
        source: RAW,
        maxEndpoints: MAX_ENDPOINTS,
        definitions: kept
    }, null, 2) + '\n');

    process.stdout.write('\nkept ' + kept.length + ' of ' + wanted.length +
        ', written to ' + path.relative(path.join(__dirname, '..'), OUT) + '\n');
}

main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
});
