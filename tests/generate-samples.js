'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const flowgen = require('../flowgen');
const specs = require('./specs');

const OUT = process.env.SAMPLES_DIR || path.join(__dirname, '..', 'samples');

function collectionFiles(dir) {
    const files = [];
    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(bru|ya?ml|json)$/.test(entry.name)) {
                files.push({ path: path.relative(dir, full), text: fs.readFileSync(full, 'utf8') });
            }
        }
    };
    walk(dir);
    return files;
}

const safe = text => String(text)
    .replace(/^\//, '')
    .replace(/[^A-Za-z0-9._{}-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';

function writeSource(name, doc, summary) {
    const dir = path.join(OUT, safe(name));
    fs.mkdirSync(dir, { recursive: true });

    let list;
    try {
        list = flowgen.listOperations(doc);
    } catch (err) {
        summary.push({ source: name, error: err.message });
        return;
    }

    let written = 0;
    let failed = 0;
    for (const op of list.operations) {
        const file = path.join(dir, op.method + '-' + safe(op.path) + '.js');
        try {
            const code = flowgen.generate(doc, op.method, op.path);
            new Function(code);
            fs.writeFileSync(file, code + '\n');
            written++;
        } catch (err) {
            fs.writeFileSync(file.replace(/\.js$/, '.error.txt'), String(err.message) + '\n');
            failed++;
        }
    }

    const flows = [];
    for (const op of list.operations.slice(0, 5)) {
        try {
            flows.push({ operation: op.method + ' ' + op.path,
                flow: flowgen.buildFlow(doc, op.method, op.path) });
        } catch (err) {
            // a failure is already recorded above
        }
    }
    if (flows.length) {
        fs.writeFileSync(path.join(dir, '_flows.json'), JSON.stringify(flows, null, 2) + '\n');
    }

    summary.push({ source: name, format: list.format, operations: list.count,
        written: written, failed: failed });
}

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const summary = [];

    for (const name of ['ollama-openapi3', 'ollama-swagger2']) {
        const file = path.join(__dirname, '..', 'specs', name + '.yaml');
        writeSource(name, flowgen.parseDocument(fs.readFileSync(file, 'utf8')), summary);
    }
    writeSource('ollama-bruno',
        flowgen.parseCollection(collectionFiles(path.join(__dirname, '..', 'specs', 'ollama-bruno'))),
        summary);

    for (const version of ['v2', 'v3']) {
        try {
            writeSource('petstore-' + version,
                flowgen.parseDocument(await specs.spec(version)), summary);
        } catch (err) {
            summary.push({ source: 'petstore-' + version, error: err.message });
        }
    }

    const live = fs.readFileSync(path.join(__dirname, 'test-live.js'), 'utf8');
    const block = live.slice(live.indexOf('const BRUNO_SOURCES'), live.indexOf('const CASES'));
    const repos = [...block.matchAll(/git: '([^']+)'/g)].map(m => m[1]);

    for (const repo of repos) {
        const name = 'bruno-' + safe(repo.split('/').pop().replace(/\.git$/, ''));
        let tmp = null;
        try {
            tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samples-'));
            execFileSync('git', ['clone', '--quiet', '--depth', '1', repo, tmp],
                { stdio: 'pipe', timeout: 120000 });
            writeSource(name, flowgen.parseCollection(collectionFiles(tmp)), summary);
        } catch (err) {
            summary.push({ source: name, error: String(err.message).split('\n')[0] });
        } finally {
            if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
        }
    }

    const totals = summary.reduce((acc, entry) => {
        acc.sources++;
        acc.written += entry.written || 0;
        acc.failed += entry.failed || 0;
        if (entry.error) acc.unavailable++;
        return acc;
    }, { sources: 0, written: 0, failed: 0, unavailable: 0 });

    fs.writeFileSync(path.join(OUT, 'index.json'),
        JSON.stringify({ totals: totals, sources: summary }, null, 2) + '\n');

    const lines = summary.map(entry => entry.error
        ? '  ' + entry.source + ': unavailable, ' + entry.error
        : '  ' + entry.source + ': ' + entry.written + ' files, ' + entry.failed + ' failed');
    fs.writeFileSync(path.join(OUT, 'index.txt'),
        'Generated JavaScript for every endpoint of every definition\n\n' +
        lines.join('\n') + '\n\ntotals: ' + JSON.stringify(totals) + '\n');

    process.stdout.write('::notice::generated ' + totals.written +
        ' files from ' + totals.sources + ' definitions, ' + totals.failed + ' failed\n');

    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
            '## Generated code\n\n```\n' + lines.join('\n') +
            '\n\ntotals: ' + JSON.stringify(totals) + '\n```\n');
    }

    process.exit(totals.failed ? 1 : 0);
}

main().catch(err => {
    process.stdout.write('::error::sample generation crashed: ' + err.message + '\n');
    process.exit(1);
});
