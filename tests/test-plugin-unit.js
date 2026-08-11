'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { execFileSync } = require('child_process');
const zipwriter = require('./zipwriter');

const plugin = require('../flowgen-plugin.js');

let server;
let port;
let registered;
let logged;

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(Object.assign({ host: '127.0.0.1', port: port }, options), res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                type: res.headers['content-type'] || '',
                body: Buffer.concat(chunks).toString('utf8')
            }));
        });
        req.on('error', reject);
        req.end(body);
    });
}

const get = urlPath => request({ path: urlPath, method: 'GET' });

before(async () => {
    registered = [];
    logged = [];
    const RED = {
        httpAdmin: express(),
        plugins: { registerPlugin: (id, def) => { registered.push(id); if (def.onadd) def.onadd(); } },
        log: { info: message => logged.push(message) }
    };
    plugin(RED);
    server = http.createServer(RED.httpAdmin);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

test('the plugin registers itself and logs once', () => {
    assert.deepStrictEqual(registered, ['node-red-flowgen']);
    assert.strictEqual(logged.length, 1);
    assert.match(logged[0], /flowgen/i);
});

test('the shared flowgen source is served unchanged', async () => {
    const res = await get('/flowgen/generator.js');
    assert.strictEqual(res.status, 200);
    assert.match(res.type, /javascript/);
    assert.strictEqual(res.body.replace(/\r\n/g, '\n'),
        fs.readFileSync(path.join(__dirname, '..', 'flowgen.js'), 'utf8').replace(/\r\n/g, '\n'));
});

test('the js-yaml browser build is served', async () => {
    const res = await get('/flowgen/yaml-parser.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 1000);
});

test('an unknown asset is rejected', async () => {
    assert.strictEqual((await get('/flowgen/nope.js')).status, 404);
});

test('a plain document URL is proxied', async () => {
    const upstream = http.createServer((req, res) => {
        if (req.url === '/redirect') {
            res.writeHead(302, { location: '/spec.yaml' });
            return res.end();
        }
        if (req.url === '/spec.yaml') {
            res.writeHead(200, { 'content-type': 'text/yaml' });
            return res.end('openapi: 3.0.0\n');
        }
        res.writeHead(404).end('no');
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + upstream.address().port;

    const direct = await get('/flowgen/source?url=' + encodeURIComponent(base + '/spec.yaml'));
    assert.strictEqual(direct.status, 200, direct.body);
    assert.strictEqual(JSON.parse(direct.body).text, 'openapi: 3.0.0\n');

    const redirected = await get('/flowgen/source?url=' + encodeURIComponent(base + '/redirect'));
    assert.strictEqual(JSON.parse(redirected.body).text, 'openapi: 3.0.0\n');

    const missing = await get('/flowgen/source?url=' + encodeURIComponent(base + '/gone'));
    assert.strictEqual(missing.status, 502);
    assert.match(JSON.parse(missing.body).error, /HTTP 404/);

    await new Promise(resolve => upstream.close(resolve));
});

test('a source that is not an http url is rejected', async () => {
    for (const bad of ['', 'notaurl', 'file:///etc/passwd']) {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(bad));
        assert.strictEqual(res.status, 400, bad);
        assert.match(JSON.parse(res.body).error, /http/);
    }
});

test('an unreachable host is reported as a bad gateway', async () => {
    const res = await get('/flowgen/source?url=' + encodeURIComponent('http://127.0.0.1:1/x.json'));
    assert.strictEqual(res.status, 502);
    assert.ok(JSON.parse(res.body).error.length > 0);
});

test('a git repository is cloned and its files returned', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-git-'));
    fs.writeFileSync(path.join(repo, 'r.yml'),
        'info:\n  name: R\nhttp:\n  method: GET\n  url: https://t.test/r\n');
    fs.mkdirSync(path.join(repo, 'node_modules'));
    fs.writeFileSync(path.join(repo, 'node_modules', 'skip.yml'), 'ignored: true\n');
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t',
        'commit', '-qm', 'x']);
    execFileSync('git', ['-C', repo, 'update-server-info']);

    const statics = express();
    statics.use(express.static(repo, { dotfiles: 'allow' }));
    const gitServer = http.createServer(statics);
    await new Promise(resolve => gitServer.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + gitServer.address().port + '/.git';

    const res = await get('/flowgen/source?url=' + encodeURIComponent(url));
    await new Promise(resolve => gitServer.close(resolve));
    fs.rmSync(repo, { recursive: true, force: true });

    assert.strictEqual(res.status, 200, res.body);
    const files = JSON.parse(res.body).files;
    assert.ok(files.some(f => f.path === 'r.yml'));
    assert.ok(!files.some(f => f.path.indexOf('node_modules') !== -1));
});

test('a failing clone reports the git message', async () => {
    const res = await get('/flowgen/source?url=' +
        encodeURIComponent('http://127.0.0.1:1/nope.git'));
    assert.strictEqual(res.status, 502);
    assert.match(JSON.parse(res.body).error, /git clone failed/);
});

// The runtime shares a process with Node-RED, so exhausting the heap here
// stops every flow on the host. A zip bomb is small enough to pass any upload
// limit and only becomes dangerous once decompressed.
const post = zip => request({
    path: '/flowgen/source', method: 'POST',
    headers: { 'content-type': 'application/zip', 'content-length': zip.length }
}, zip);

test('a single entry that expands past the limit is refused', async () => {
    const zip = zipwriter.buildDeflated([
        { path: 'bomb.yaml', text: 'a'.repeat(20 * 1024 * 1024) }
    ]);
    assert.ok(zip.length < 1024 * 1024,
        'the archive has to be small on the wire for this to be the right test');

    const before = process.memoryUsage().heapUsed;
    const res = await post(zip);
    const grew = (process.memoryUsage().heapUsed - before) / (1024 * 1024);

    assert.strictEqual(res.status, 400, res.body);
    assert.match(JSON.parse(res.body).error, /limit for one file/);
    assert.ok(grew < 64, 'the heap grew by ' + Math.round(grew) + 'MB, so it decompressed');
});

test('entries that are each small but add up past the limit are refused', async () => {
    const entries = [];
    for (let i = 0; i < 10; i++) {
        entries.push({ path: 'part' + i + '.yaml', text: 'b'.repeat(12 * 1024 * 1024) });
    }
    const res = await post(zipwriter.buildDeflated(entries));

    assert.strictEqual(res.status, 400, res.body);
    assert.match(JSON.parse(res.body).error, /expands past the/);
});

test('an entry whose header understates its size is refused', async () => {
    // The declared size is attacker controlled, so believing it is not enough.
    const zip = zipwriter.buildDeflated([
        { path: 'liar.yaml', text: 'c'.repeat(20 * 1024 * 1024), declaredSize: 1000 }
    ]);

    const before = process.memoryUsage().heapUsed;
    const res = await post(zip);
    const grew = (process.memoryUsage().heapUsed - before) / (1024 * 1024);

    assert.strictEqual(res.status, 400, res.body);
    assert.ok(grew < 64, 'the heap grew by ' + Math.round(grew) + 'MB despite the lie');
});

test('an archive with a huge number of usable files is refused', async () => {
    const entries = [];
    for (let i = 0; i < 2100; i++) {
        entries.push({ path: 'f' + i + '.yaml', text: 'x: ' + i });
    }
    const res = await post(zipwriter.buildDeflated(entries));

    assert.strictEqual(res.status, 400, res.body);
    assert.match(JSON.parse(res.body).error, /more than 2000 usable files/);
});

test('an ordinary archive still comes through', async () => {
    const res = await post(zipwriter.buildDeflated([
        { path: 'req.bru', text: 'meta {\n  name: P\n}\n\nget {\n  url: https://t.test/p\n}\n' }
    ]));
    assert.strictEqual(res.status, 200, res.body);
    assert.deepStrictEqual(JSON.parse(res.body).files.map(f => f.path), ['req.bru']);
});

test('an uploaded zip is unpacked and filtered', async () => {
    const zip = zipwriter.build([
        { path: 'req.bru', text: 'meta {\n  name: P\n}\n\nget {\n  url: https://t.test/p\n}\n' },
        { path: 'notes.txt', text: 'ignored' },
        { path: '.git/config', text: 'ignored' },
        { path: 'node_modules/x.yml', text: 'ignored' }
    ]);
    const res = await request({
        path: '/flowgen/source', method: 'POST',
        headers: { 'content-type': 'application/zip', 'content-length': zip.length }
    }, zip);

    assert.strictEqual(res.status, 200, res.body);
    const files = JSON.parse(res.body).files;
    assert.deepStrictEqual(files.map(f => f.path), ['req.bru']);
    assert.match(files[0].text, /t\.test\/p/);
});

test('a corrupt zip is reported rather than throwing', async () => {
    const body = Buffer.from('definitely not a zip');
    const res = await request({
        path: '/flowgen/source', method: 'POST',
        headers: { 'content-type': 'application/zip', 'content-length': body.length }
    }, body);
    assert.strictEqual(res.status, 400);
    assert.match(JSON.parse(res.body).error, /zip/i);
});

// ---------------------------------------------------------------------------
// Malformed and hostile input
//
// The runtime shares a process with Node-RED, so a route that throws where
// nothing catches takes every flow on the host down with it. What matters in
// each case below is not the status code but that the process is still
// answering afterwards.
// ---------------------------------------------------------------------------

const postJson = (route, body) => request({
    path: '/flowgen/' + route, method: 'POST',
    headers: { 'content-type': 'application/json' }
}, typeof body === 'string' ? body : JSON.stringify(body));

async function stillAlive() {
    const res = await get('/flowgen/generator.js');
    assert.strictEqual(res.status, 200, 'the runtime stopped answering');
}

test('a body that is not json is refused rather than thrown', async () => {
    for (const body of ['', 'not json', '{', '[1,2', '"a string"', '123']) {
        const res = await postJson('parse', body);
        assert.ok(res.status < 500, JSON.stringify(body) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('a parse request with nothing usable in it is refused', async () => {
    for (const body of [{}, { text: null }, { text: 42 }, { files: 'not an array' },
        { files: [null] }, { files: [{}] }, { files: [{ path: 1, text: 2 }] }]) {
        const res = await postJson('parse', body);
        assert.ok(res.status < 500, JSON.stringify(body) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('a flows request with a nonsense document is refused', async () => {
    for (const body of [{}, { doc: null }, { doc: 'text' }, { doc: {}, targets: 'x' },
        { doc: { openapi: '3.0.0' }, targets: [{ method: 'get', path: '/nope' }] },
        { doc: { openapi: '3.0.0', paths: {} }, targets: [null] }]) {
        const res = await postJson('flows', body);
        assert.ok(res.status < 500, JSON.stringify(body) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('a document that is valid yaml but not a specification is refused', async () => {
    for (const text of ['just a string', '- 1\n- 2\n', 'a: 1\n', 'null\n']) {
        const res = await postJson('parse', { text: text });
        assert.ok(res.status < 500, JSON.stringify(text) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('yaml that cannot be parsed is reported, not thrown', async () => {
    for (const text of ['a:\n  - b\n c: broken', '{unclosed: ',
        '!!python/object:os.system []']) {
        const res = await postJson('parse', { text: text });
        assert.ok(res.status < 500, JSON.stringify(text) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('a deeply nested document does not blow the stack', async () => {
    // Recursion over the document is the risk: a stack overflow is not a
    // catchable error the way a thrown Error is, so it would end the process.
    let nested = 'x';
    for (let depth = 0; depth < 5000; depth++) { nested = '{a: ' + nested + '}'; }
    const res = await postJson('parse', { text: 'openapi: 3.0.3\nx: ' + nested });
    assert.ok(res.status < 500, 'gave ' + res.status);
    await stillAlive();
});

test('a self referencing schema does not spin forever', async () => {
    const text = [
        'openapi: 3.0.3',
        'info: { title: loop, version: "1" }',
        'servers: [{ url: "https://x.test" }]',
        'components:',
        '  schemas:',
        '    Node:',
        '      type: object',
        '      properties:',
        '        child: { $ref: "#/components/schemas/Node" }',
        'paths:',
        '  /x:',
        '    post:',
        '      requestBody:',
        '        content:',
        '          application/json:',
        '            schema: { $ref: "#/components/schemas/Node" }',
        '      responses: { "200": { description: ok } }'
    ].join('\n');

    const started = Date.now();
    const res = await postJson('parse', { text: text });
    assert.ok(Date.now() - started < 20000, 'the request took too long to come back');
    assert.ok(res.status < 500, 'gave ' + res.status);

    if (res.status === 200) {
        const built = await postJson('flows', {
            doc: JSON.parse(res.body).doc,
            targets: [{ method: 'post', path: '/x' }]
        });
        assert.ok(built.status < 500, 'building gave ' + built.status);
    }
    await stillAlive();
});

test('a document with a great many endpoints is handled or refused, not fatal', async () => {
    const lines = ['openapi: 3.0.3', 'info: { title: many, version: "1" }',
        'servers: [{ url: "https://x.test" }]', 'paths:'];
    for (let i = 0; i < 3000; i++) {
        lines.push('  /p' + i + ':', '    get:',
            '      responses: { "200": { description: ok } }');
    }
    const res = await postJson('parse', { text: lines.join('\n') });
    assert.ok(res.status < 500, 'gave ' + res.status);
    await stillAlive();
});

test('a source url that is malformed is refused', async () => {
    for (const bad of ['', ' ', 'javascript:alert(1)', 'file:///etc/passwd',
        'http://', 'https://', 'ht!tp://x', '//example.test/x']) {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(bad));
        assert.ok(res.status >= 400 && res.status < 500,
            JSON.stringify(bad) + ' gave ' + res.status);
    }
    await stillAlive();
});

test('an upload that is not a zip at all is reported', async () => {
    for (const body of [Buffer.alloc(0), Buffer.from('not a zip'),
        Buffer.from('PK\u0003\u0004 truncated'), Buffer.alloc(64, 0)]) {
        const res = await request({
            path: '/flowgen/source', method: 'POST',
            headers: { 'content-type': 'application/zip', 'content-length': body.length }
        }, body);
        assert.ok(res.status < 500, 'gave ' + res.status);
    }
    await stillAlive();
});

test('several awkward requests at once do not disturb each other', async () => {
    const work = [];
    for (let i = 0; i < 10; i++) {
        work.push(postJson('parse', { text: 'not: [a, spec' }));
        work.push(postJson('flows', { doc: null }));
        work.push(postJson('parse', {
            text: 'openapi: 3.0.3\ninfo: { title: t, version: "1" }\n' +
                'servers: [{ url: "https://x.test" }]\n' +
                'paths: { /x: { get: { responses: { "200": { description: ok } } } } }'
        }));
    }
    const results = await Promise.all(work);
    assert.strictEqual(results.filter(r => r.status >= 500).length, 0,
        'nothing should have produced a server error');
    assert.ok(results.some(r => r.status === 200), 'the valid ones should still succeed');
    await stillAlive();
});

test('a url that answers with too many bytes is refused', async () => {
    // No route may pull an unbounded reply into a process it shares with every
    // flow on the host. The server here never stops sending.
    let closed = false;
    const flood = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        const chunk = 'x'.repeat(64 * 1024);
        const pump = () => {
            if (closed || res.writableEnded) { return; }
            if (res.write(chunk)) { setImmediate(pump); }
            else { res.once('drain', pump); }
        };
        res.on('close', () => { closed = true; });
        pump();
    });
    await new Promise(resolve => flood.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + flood.address().port + '/endless.yaml';

    try {
        const before = process.memoryUsage().heapUsed;
        const res = await get('/flowgen/source?url=' + encodeURIComponent(url));
        const grew = (process.memoryUsage().heapUsed - before) / (1024 * 1024);

        assert.ok(res.status >= 400, 'an endless reply must not come back as success');
        assert.match(JSON.parse(res.body).error, /more than \d+ bytes/);
        assert.ok(grew < 128, 'the heap grew by ' + Math.round(grew) + 'MB');
    } finally {
        closed = true;
        await new Promise(resolve => flood.close(resolve));
    }
});

// ---------------------------------------------------------------------------
// Paths the ordinary cases never reach
//
// These are the branches that only run when something goes wrong, which is
// exactly when the runtime shares a process with every flow on the host.
// ---------------------------------------------------------------------------

test('an oversized definition is refused rather than parsed', async () => {
    // body-parser has its own ceiling and answers first, so what matters is
    // that something refuses this and the runtime survives, not which layer.
    const res = await postJson('parse', { text: 'x'.repeat(17 * 1024 * 1024) });
    assert.ok(res.status >= 400 && res.status < 500, 'gave ' + res.status);
    await stillAlive();
});

test('an oversized collection is refused rather than parsed', async () => {
    const files = [];
    for (let i = 0; i < 20; i++) {
        files.push({ path: 'f' + i + '.yml', text: 'x'.repeat(1024 * 1024) });
    }
    const res = await postJson('parse', { files: files });
    assert.ok(res.status >= 400 && res.status < 500, 'gave ' + res.status);
    await stillAlive();
});

test('a source url that redirects forever gives up', async () => {
    const loop = http.createServer((req, res) => {
        res.writeHead(302, { location: '/again' });
        res.end();
    });
    await new Promise(resolve => loop.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + loop.address().port + '/start';

    try {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(url));
        assert.ok(res.status >= 400, 'gave ' + res.status);
        assert.match(JSON.parse(res.body).error, /redirect/i);
    } finally {
        await new Promise(resolve => loop.close(resolve));
    }
    await stillAlive();
});

test('a source that never stops sending is cut off', async () => {
    // Without a ceiling a single url could exhaust the heap, and the runtime
    // shares its heap with every flow on the host.
    let closed = false;
    const firehose = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        const pump = () => {
            if (closed || !res.write('x'.repeat(1024 * 1024))) { return; }
            setImmediate(pump);
        };
        res.on('close', () => { closed = true; });
        pump();
    });
    await new Promise(resolve => firehose.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + firehose.address().port + '/big';

    try {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(url));
        assert.ok(res.status >= 400 || res.status === 200, 'gave ' + res.status);
    } finally {
        closed = true;
        await new Promise(resolve => firehose.close(resolve));
    }
    await stillAlive();
});

test('a git url whose protocol is not http is refused', async () => {
    for (const bad of ['ftp://example.test/x.git', 'ssh://git@example.test/x.git',
        'file:///tmp/x.git']) {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(bad));
        assert.ok(res.status >= 400 && res.status < 500,
            bad + ' gave ' + res.status);
    }
    await stillAlive();
});

test('a repository that holds nothing usable is reported', async () => {
    const os = require('os');
    const { execFileSync } = require('child_process');

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-ep-empty-'));
    fs.writeFileSync(path.join(repo, 'README.md'), 'nothing here');
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t',
        'commit', '-qm', 'x']);
    execFileSync('git', ['-C', repo, 'update-server-info']);

    const statics = express();
    statics.use(express.static(repo, { dotfiles: 'allow' }));
    const gitServer = http.createServer(statics);
    await new Promise(resolve => gitServer.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + gitServer.address().port + '/.git';

    try {
        const res = await get('/flowgen/source?url=' + encodeURIComponent(url));
        assert.ok(res.status < 500, 'gave ' + res.status);
        if (res.status === 200) {
            assert.deepStrictEqual(JSON.parse(res.body).files, []);
        }
    } finally {
        await new Promise(resolve => gitServer.close(resolve));
        fs.rmSync(repo, { recursive: true, force: true });
    }
    await stillAlive();
});

test('a zip whose entries are all uninteresting yields nothing', async () => {
    const zip = zipwriter.buildDeflated([
        { path: 'README.md', text: 'no' },
        { path: 'src/index.ts', text: 'no' },
        { path: '.git/config', text: 'no' },
        { path: 'node_modules/x.yml', text: 'no' }
    ]);
    const res = await request({
        path: '/flowgen/source', method: 'POST',
        headers: { 'content-type': 'application/zip', 'content-length': zip.length }
    }, zip);

    assert.strictEqual(res.status, 200, res.body);
    assert.deepStrictEqual(JSON.parse(res.body).files, []);
    await stillAlive();
});

test('every route demands the flows.write permission', () => {
    const asked = [];
    const guard = function (req, res, next) { next(); };
    const routes = [];
    const RED = {
        httpAdmin: {
            get: (path, ...rest) => routes.push({ method: 'get', path, rest }),
            post: (path, ...rest) => routes.push({ method: 'post', path, rest })
        },
        plugins: { registerPlugin: () => {} },
        log: { info: () => {} },
        auth: { needsPermission: permission => { asked.push(permission); return guard; } }
    };
    plugin(RED);

    assert.ok(routes.length >= 3, 'the plugin registers its routes');
    assert.deepStrictEqual([...new Set(asked)], ['flows.write'],
        'the only permission asked for is flows.write');
    for (const route of routes) {
        assert.strictEqual(route.rest[0], guard,
            route.method.toUpperCase() + ' ' + route.path + ' must be guarded first');
        assert.strictEqual(route.rest.length, 2, 'guard then handler');
    }
});

test('the routes still work when no auth is configured', () => {
    const routes = [];
    const RED = {
        httpAdmin: {
            get: (path, ...rest) => routes.push({ path, rest }),
            post: (path, ...rest) => routes.push({ path, rest })
        },
        plugins: { registerPlugin: () => {} },
        log: { info: () => {} }
    };
    plugin(RED);

    assert.ok(routes.length >= 3);
    for (const route of routes) {
        assert.strictEqual(typeof route.rest[0], 'function',
            'a pass through guard is installed for ' + route.path);
        let called = false;
        route.rest[0]({}, {}, () => { called = true; });
        assert.strictEqual(called, true, 'the guard calls next when auth is off');
    }
});
