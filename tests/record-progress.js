'use strict';

// Reads the corpus jobs of a CI run and writes tests/progress.md, then retires
// the definitions that passed so the next run spends its time on ones that have
// not been proven yet.
//
//   GITHUB_TOKEN=... node tests/record-progress.js <run-id>
//
// A definition is retired only on a pass. A failure stays in the corpus: it is
// the reason to keep looking.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = process.env.GITHUB_REPOSITORY || 'zuhito/node-red-flowgen';
const TOKEN = process.env.GITHUB_TOKEN || '';
const RUN = process.argv[2];
const PROGRESS = path.join(__dirname, 'progress.md');
const CORPUS = path.join(__dirname, 'specs', 'corpus.json');

function api(route) {
    const args = ['-s'];
    if (TOKEN) { args.push('-H', 'Authorization: token ' + TOKEN); }
    args.push('https://api.github.com/repos/' + REPO + '/' + route);
    return JSON.parse(execFileSync('curl', args, {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
    }));
}

function allJobs(runId) {
    const jobs = [];
    for (let page = 1; ; page++) {
        // The jobs endpoint pages at 30 by default, which is how a 134 job run
        // first looked like a 10 job one.
        const got = api('actions/runs/' + runId + '/jobs?per_page=100&page=' + page).jobs;
        if (!got || !got.length) { break; }
        jobs.push(...got);
        if (got.length < 100) { break; }
    }
    return jobs;
}

// What makes this definition unlike the others, so a reader can tell at a
// glance why it was worth calling.
function methodBreakdown(entry) {
    const methods = entry.methods || {};
    const parts = Object.keys(methods).sort()
        .map(name => name.toUpperCase() + ' ' + methods[name]);
    return parts.length ? parts.join(', ') : 'unknown';
}

// What makes this definition unlike the others, so a reader can tell at a
// glance why it was worth calling rather than only that it passed.
function character(entry) {
    const traits = [];
    const methods = Object.keys(entry.methods || {});
    if (methods.length > 3) { traits.push('many verbs'); }
    else if (methods.length === 1) { traits.push('read only'); }
    if (entry.endpoints > 100) { traits.push('large surface'); }
    else if (entry.endpoints <= 3) { traits.push('tiny surface'); }
    if (entry.callable !== undefined && entry.callable < entry.endpoints) {
        traits.push(entry.callable + ' of ' + entry.endpoints + ' callable anonymously');
    }
    if (/\.gov\//.test(entry.spec)) { traits.push('government'); }
    return traits.length ? traits.join('; ') : 'plain';
}

function main() {
    if (!RUN) {
        process.stderr.write('usage: node tests/record-progress.js <run-id>\n');
        process.exit(2);
    }

    const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
    const byId = new Map(corpus.definitions.map(d => [d.id, d]));

    const run = api('actions/runs/' + RUN);
    const jobs = allJobs(RUN).filter(job => /^corpus \(/.test(job.name));
    const sha = run.head_sha;

    const rows = [];
    const passed = new Set();
    for (const job of jobs) {
        const id = (job.name.match(/^corpus \(([^,]+)/) || [])[1];
        const entry = byId.get(id);
        if (!entry) { continue; }

        const status = job.conclusion === 'success' ? 'pass'
            : job.conclusion === 'skipped' ? 'skipped' : 'fail';
        if (status === 'pass') { passed.add(id); }

        rows.push({
            spec: entry.spec,
            status: status,
            endpoints: entry.endpoints,
            format: entry.format || 'unknown',
            methods: methodBreakdown(entry),
            callable: entry.callable === undefined ? '?' : entry.callable,
            probe: entry.probe.method.toUpperCase() + ' ' + entry.probe.path,
            sha: sha.slice(0, 8),
            traits: character(entry)
        });
    }

    rows.sort((a, b) => a.spec.localeCompare(b.spec));

    const head = fs.existsSync(PROGRESS)
        ? fs.readFileSync(PROGRESS, 'utf8').split('<!-- rows -->')[0]
        : ['# Corpus progress', '',
            'Public API definitions called for real, comparing curl against a',
            'generated flow. A definition that passes is retired from the corpus',
            'so the next run spends its time on ones not yet proven; a definition',
            'that fails stays, because that is the reason to keep looking.', '',
            '| Definition | Status | Format | Endpoints | By method | Called | Probed | flowgen | Character |',
            '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ''].join('\n');

    const existing = fs.existsSync(PROGRESS)
        ? fs.readFileSync(PROGRESS, 'utf8').split('<!-- rows -->')[1] || ''
        : '';

    const lines = rows.map(r => '| `' + r.spec + '` | ' + r.status + ' | ' + r.format +
        ' | ' + r.endpoints + ' | ' + r.methods + ' | ' + r.callable +
        ' | `' + r.probe + '` | `' + r.sha + '` | ' + r.traits + ' |');

    fs.writeFileSync(PROGRESS, head + '<!-- rows -->\n' +
        existing.trim() + (existing.trim() ? '\n' : '') + lines.join('\n') + '\n');

    const left = corpus.definitions.filter(d => !passed.has(d.id));
    corpus.definitions = left;
    fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + '\n');

    process.stdout.write('recorded ' + rows.length + ' definitions, retired ' +
        passed.size + ', ' + left.length + ' left in the corpus\n');
}

main();
