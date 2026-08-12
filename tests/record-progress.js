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
const RAW = 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';
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
// The verbs actually requested, not the ones the definition declares. Saying
// the run covered POST and DELETE when it only ever issued GETs would overstate
// what was proven.
// The column shows the command that was actually run, not a summary of it, so
// the reader can paste it and see the same answer the test saw. These flags
// mirror tests/test-corpus.js: without --location a moved host answers 301 to
// curl while Node-RED follows and reports 200, and the two disagree for a
// reason that has nothing to do with the generated request.
function curlCommand(probe) {
    const method = String(probe.method || 'get').toUpperCase();
    const url = probe.url || probe.path;
    return 'curl -sS -i --location --max-redirs 5 --globoff --max-time 25' +
        " -A 'flowgen-corpus/1.0' -X " + method + " '" + url + "'";
}

function methodBreakdown(entry) {
    const methods = entry.methods || {};
    const parts = Object.keys(methods).sort()
        .map(name => name.toUpperCase() + ' ' + methods[name]);
    return parts.length ? parts.join(', ') : '不明';
}

// What makes this definition unlike the others, so a reader can tell at a
// glance why it was worth calling rather than only that it passed.
function character(entry) {
    const traits = [];
    const methods = Object.keys(entry.methods || {});
    if (methods.length > 3) { traits.push('メソッドが多い'); }
    else if (methods.length === 1) { traits.push('参照のみ'); }
    if (entry.endpoints > 100) { traits.push('大規模'); }
    else if (entry.endpoints <= 3) { traits.push('小規模'); }
    if (entry.callable !== undefined && entry.callable < entry.endpoints) {
        traits.push('認証なしで呼べるのは ' + entry.endpoints + ' 中 ' + entry.callable);
    }
    if (/\.gov\//.test(entry.spec)) { traits.push('政府機関'); }
    return traits.length ? traits.join('、') : '特記なし';
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

        const status = job.conclusion === 'success' ? '成功'
            : job.conclusion === 'skipped' ? '除外' : '失敗';
        if (status === '成功') { passed.add(id); }

        rows.push({
            spec: entry.spec,
            status: status,
            endpoints: entry.endpoints,
            format: entry.format || '不明',
            methods: methodBreakdown(entry),
            callable: entry.callable === undefined ? '?' : entry.callable,
            probe: curlCommand(entry.probe),
            sha: sha.slice(0, 8),
            traits: character(entry)
        });
    }

    rows.sort((a, b) => a.spec.localeCompare(b.spec));

    // The file is rebuilt from its own table rather than split on a marker.
    // Splitting on "<!-- rows -->" matched the path /rest/v1/neo/browse, whose
    // "browse" contains "rows", and tore the table in half.
    const previous = [];
    if (fs.existsSync(PROGRESS)) {
        for (const line of fs.readFileSync(PROGRESS, 'utf8').split('\n')) {
            if (/^\|\s*\[`/.test(line)) { previous.push(line); }
        }
    }

    const seen = new Set(rows.map(r => r.spec));
    const kept = previous.filter(line => {
        const match = line.match(/^\|\s*\[`([^`]+)`\]/);
        return match && !seen.has(match[1]);
    });

    // The definition links to the file that was actually fetched, so a reader
    // can open exactly what was tested rather than go looking for it.
    const lines = rows.map(r => '| [`' + r.spec + '`](' + RAW + r.spec + ') | ' +
        r.status + ' | ' + r.format +
        ' | ' + r.endpoints + ' | ' + r.methods + ' | ' + r.callable +
        ' | `' + r.probe + '` | `' + r.sha + '` | ' + r.traits + ' |');

    const all = kept.concat(lines).sort();
    const passes = all.filter(line => /\|\s*成功\s*\|/.test(line)).length;

    fs.writeFileSync(PROGRESS, [
        '# 実 API に対する検証の記録',
        '',
        '公開されている API 定義を実際に呼び出し、curl のレスポンスと、生成した',
        'フローの debug ノードが受け取った内容が一致するかを確かめた記録です。',
        '',
        '成功した定義は対象から外します。同じものを繰り返し確かめるより、まだ',
        '確かめていない定義に時間を使うためです。失敗した定義は残します。それが',
        '調べ続ける理由だからです。',
        '',
        '検証済み **' + all.length + '** 定義（うち成功 ' + passes + '）。',
        '',
        '| 定義 | 結果 | 形式 | 定義されたエンドポイント数 | 実際に呼んだ内訳 | 実際に呼んだ数 | 到達確認に使った経路 | flowgen | この定義の特徴 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        all.join('\n'),
        ''
    ].join('\n'));

    const left = corpus.definitions.filter(d => !passed.has(d.id));
    corpus.definitions = left;
    fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + '\n');

    process.stdout.write('recorded ' + rows.length + ' definitions, retired ' +
        passed.size + ', ' + left.length + ' left in the corpus\n');
}

main();
