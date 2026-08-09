'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const flowgen = require('../flowgen');

const SPEC = path.join(__dirname, 'specs', 'httpbingo-full.yaml');

const FILL = {
    user: 'someuser',
    passwd: 'somepass',
    qop: 'auth',
    code: '200',
    n: '1',
    numbytes: '8',
    duration: '1',
    delay: '1',
    value: 'aGVsbG8=',
    etag: 'sometag',
    name: 'demo',
    freeform: 'demo'
};

const PLACEHOLDER = Buffer.from('{user}:{passwd}').toString('base64');

const CREDENTIALS = {
    bearer: 'Bearer sometoken',
    basic: 'Basic ' + Buffer.from('someuser:somepass').toString('base64'),
    digest: 'Digest username="someuser", realm="httpbingo", nonce="x", uri="/", response="x"'
};

function note(level, text) {
    process.stdout.write('::' + level + '::' + String(text).replace(/\r?\n/g, ' ') + '\n');
}

function curl(method, url, headers, body) {
    const args = ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20',
        '-X', method.toUpperCase(), url];
    for (const [name, value] of Object.entries(headers || {})) {
        args.push('-H', name + ': ' + value);
    }
    if (body) { args.push('--data-binary', body); }
    return new Promise(resolve => {
        execFile('curl', args, { timeout: 30000 }, (err, stdout) => {
            const code = parseInt(String(stdout).trim(), 10);
            resolve(Number.isFinite(code) && code > 0 ? code : null);
        });
    });
}

async function main() {
    const doc = flowgen.parseDocument(fs.readFileSync(SPEC, 'utf8'));
    const operations = flowgen.listOperations(doc).operations;
    note('notice', 'checking ' + operations.length + ' httpbingo endpoints');

    const problems = [];
    const results = [];

    for (const op of operations) {
        const label = op.method.toUpperCase() + ' ' + op.path;
        let msg;
        try {
            msg = new Function('msg', flowgen.generate(doc, op.method, op.path)).call(null, {});
        } catch (err) {
            problems.push(label + ' -> the generated code is broken: ' + err.message);
            continue;
        }

        let url = msg.url;
        for (const [name, value] of Object.entries(FILL)) {
            url = url.split('{' + name + '}').join(value);
        }
        if (/\{[^}]+\}/.test(url)) {
            problems.push(label + ' -> no sample value for ' + url);
            continue;
        }

        const headers = {};
        for (const [name, value] of Object.entries(msg.headers || {})) {
            let filled = String(value);
            if (/^Bearer \{/.test(filled)) { filled = CREDENTIALS.bearer; }
            else if (/^Basic \{/.test(filled) ||
                filled === 'Basic ' + PLACEHOLDER) { filled = CREDENTIALS.basic; }
            else if (/^Digest \{/.test(filled) ||
                filled === 'Digest ' + PLACEHOLDER) { filled = CREDENTIALS.digest; }
            if (/\{[^}]+\}/.test(filled)) {
                problems.push(label + ' -> no sample value for header ' + name);
                filled = null;
            }
            if (filled !== null) { headers[name] = filled; }
        }

        const body = msg.payload === undefined ? null
            : (typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload));

        const status = await curl(op.method, url, headers, body);
        results.push({ label: label, url: url, status: status });

        const tolerated = op.path === '/deny' ? [403]
            : /digest-auth/.test(op.path) ? [401] : [];
        if (status === null) {
            problems.push(label + ' -> no response from ' + url);
        } else if (status >= 400 && tolerated.indexOf(status) === -1) {
            problems.push(label + ' -> HTTP ' + status + ' for ' + url +
                ' (the definition likely does not describe this endpoint correctly)');
        }
    }

    for (const entry of results) {
        note('notice', entry.label + ' -> HTTP ' + (entry.status === null ? 'none' : entry.status));
    }
    for (const problem of problems) { note('error', problem); }

    if (process.env.GITHUB_STEP_SUMMARY) {
        const lines = results.map(r =>
            (r.status && r.status < 400 ? 'ok   | ' : 'FAIL | ') +
            r.label + ' -> ' + (r.status === null ? 'no response' : r.status));
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
            '## httpbingo definition check\n\n```\n' + lines.join('\n') + '\n```\n');
    }

    note('notice', 'httpbingo endpoints checked: ' + results.length +
        ', problems: ' + problems.length);
    process.exit(problems.length ? 1 : 0);
}

main().catch(err => {
    note('error', 'the httpbingo check crashed: ' + err.message);
    process.exit(1);
});
