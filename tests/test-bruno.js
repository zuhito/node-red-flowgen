'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const zipwriter = require('./zipwriter');
const flowgen = require('../flowgen');

function evaluate(code) {
    const msg = {};
    return new Function('msg', code).call(null, msg) || msg;
}

const BRU = `meta {
  name: Create user
  type: http
}

post {
  url: {{baseUrl}}/users?verbose=true
  body: json
  auth: bearer
}

headers {
  X-Trace: abc
  ~X-Off: nope
}

auth:bearer {
  token: {{token}}
}

body:json {
  { "name": "rex" }
}
`;

const YML = `info:
  name: Get user
  type: http
  seq: 1

http:
  method: GET
  url: https://api.example.test/users/1

headers:
  - name: Accept
    value: application/json
`;

const ENV = `vars {
  baseUrl: https://api.example.test
}
`;

let dir;

before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-'));
    fs.writeFileSync(path.join(dir, 'opencollection.yml'), 'opencollection: 1.0.0\n');
    fs.writeFileSync(path.join(dir, 'create-user.bru'), BRU);
    fs.writeFileSync(path.join(dir, 'get-user.yml'), YML);
    fs.mkdirSync(path.join(dir, 'environments'));
    fs.writeFileSync(path.join(dir, 'environments', 'local.bru'), ENV);
});

const run = args => new Promise(resolve =>
    execFile('node', [path.join(__dirname, '..', 'flowgen.js')].concat(args),
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

test('a bru file parses into a request with vars resolved from the environment', () => {
    const doc = flowgen.parseCollection([
        { path: 'create-user.bru', text: BRU },
        { path: 'environments/local.bru', text: ENV }
    ]);
    assert.strictEqual(flowgen.detectFormat(doc), 'bruno');
    const code = flowgen.generate(doc, 'post', '/users');
    assert.match(code, /msg\.url = "https:\/\/api\.example\.test\/users\?verbose=true";/);
    assert.match(code, /"X-Trace": "abc"/);
    assert.ok(!/X-Off/.test(code), 'disabled headers are skipped');
    assert.match(code, /"authorization": `Bearer \{token\}`/);
    assert.match(code, /msg\.payload = \{\n    "name": "rex"\n\};/);
});

test('an unresolved variable becomes a placeholder with a comment', () => {
    const doc = flowgen.parseCollection([{ path: 'create-user.bru', text: BRU }]);
    const id = flowgen.listOperations(doc).operations[0].path;
    assert.strictEqual(id, '{baseUrl}/users');
    const code = flowgen.generate(doc, 'post', id);
    assert.match(code, /\/\/ Replace \{baseUrl\} in the URL below with a real value\./);
    assert.match(code, /msg\.url = `\{baseUrl\}\/users\?verbose=true`;/);
});

test('a bruno v2 yaml request file is understood', () => {
    const doc = flowgen.parseCollection([{ path: 'get-user.yml', text: YML }]);
    const list = flowgen.listOperations(doc);
    assert.strictEqual(list.format, 'bruno');
    assert.deepStrictEqual(list.operations,
        [{ method: 'get', path: '/users/1', summary: 'Get user' }]);
    const code = flowgen.generate(doc, 'get', '/users/1');
    assert.match(code, /msg\.url = "https:\/\/api\.example\.test\/users\/1";/);
    assert.match(code, /"Accept": "application\/json"/);
});

test('duplicate method and path pairs get distinct identifiers', () => {
    const twice = YML.replace('Get user', 'Second');
    const doc = flowgen.parseCollection([
        { path: 'a.yml', text: YML }, { path: 'b.yml', text: twice }]);
    const paths = flowgen.listOperations(doc).operations.map(o => o.path);
    assert.deepStrictEqual(paths, ['/users/1', '/users/1#2']);
    assert.match(flowgen.generate(doc, 'get', '/users/1#2'), /msg\.method = "GET";/);
});

test('a bruno collection folder works from the command line', async () => {
    const listed = await run([dir, '--list']);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /post \/users\s+# Create user/);
    assert.match(listed.stdout, /get \/users\/1\s+# Get user/);

    const flow = await run([dir, 'get', '/users/1', '--flow']);
    assert.strictEqual(flow.code, 0, flow.stderr);
    const nodes = JSON.parse(flow.stdout);
    assert.strictEqual(nodes.map(n => n.type).join(','),
        'tab,inject,function,http request,debug');
});

test('a bruno export zip works from the command line', async () => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => ({ path: e.name, text: fs.readFileSync(path.join(dir, e.name)) }));
    entries.push({ path: 'environments/local.bru',
        text: fs.readFileSync(path.join(dir, 'environments', 'local.bru')) });
    const file = path.join(os.tmpdir(), 'bruno-test-' + process.pid + '.zip');
    fs.writeFileSync(file, zipwriter.build(entries, { deflate: true }));

    const listed = await run([file, '--list']);
    fs.unlinkSync(file);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /post \/users/);
    assert.match(listed.stdout, /get \/users\/1/);
});

test('a git url works from the command line', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-git-'));
    execFileSync('git', ['init', '-q', repo]);
    for (const name of ['opencollection.yml', 'get-user.yml']) {
        fs.copyFileSync(path.join(dir, name === 'get-user.yml' ? 'get-user.yml' : name),
            path.join(repo, name));
    }
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t',
        'commit', '-qm', 'x']);
    const url = repo + '/.git';

    const listed = await run([url, '--list']);
    fs.rmSync(repo, { recursive: true, force: true });
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /get \/users\/1/);
});

test('a bruno json export is detected by parseDocument', () => {
    const exported = JSON.stringify({
        name: 'col',
        items: [{
            name: 'Ping',
            request: {
                method: 'GET', url: 'https://api.example.test/ping',
                headers: [{ name: 'Accept', value: 'application/json', enabled: true }]
            }
        }]
    });
    const doc = flowgen.parseDocument(exported);
    assert.strictEqual(flowgen.detectFormat(doc), 'bruno');
    const code = flowgen.generate(doc, 'get', '/ping');
    assert.match(code, /msg\.url = "https:\/\/api\.example\.test\/ping";/);
});

test('a pasted bru file is accepted by parseDocument', () => {
    const doc = flowgen.parseDocument(BRU);
    assert.strictEqual(flowgen.listOperations(doc).count, 1);
});

test('multipart form entries follow the file upload shape', () => {
    const bru = `meta {
    name: Upload
}

post {
    url: https://api.example.test/upload
    body: multipartForm
}

body:multipart-form {
    file: @file(photo.png)
    note: hello
}
`;
    const doc = flowgen.parseDocument(bru);
    const code = flowgen.generate(doc, 'post', '/upload');
    assert.match(code, /"value": FILE_CONTENTS/);
    assert.match(code, /"filename": "photo.png"/);
    assert.match(code, /"note": "hello"/);
    assert.match(code, /const FILE_CONTENTS = Buffer\.from\("[A-Za-z0-9+/=]+", "base64"\);/);
});

test('zip entries with windows separators and nested folders are handled', async () => {
    const file = path.join(os.tmpdir(), 'bruno-win-' + process.pid + '.zip');
    fs.writeFileSync(file, zipwriter.build([
        { path: 'collection\\requests\\ping.yml',
            text: 'info:\n  name: Ping\nhttp:\n  method: GET\n  url: https://t.test/ping\n' },
        { path: 'collection/environments/local.bru', text: 'vars {\n  host: t.test\n}\n' },
        { path: 'collection/.git/config', text: 'ignored' },
        { path: 'collection/readme.md', text: 'ignored' }
    ], { deflate: true }));

    const listed = await run([file, '--list']);
    fs.unlinkSync(file);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /get \/ping\s+# Ping/);
});

test('a stored (uncompressed) zip is read as well as a deflated one', async () => {
    const entries = [{ path: 'ping.yml',
        text: 'info:\n  name: Ping\nhttp:\n  method: GET\n  url: https://t.test/ping\n' }];
    for (const deflate of [false, true]) {
        const file = path.join(os.tmpdir(), 'bruno-mode-' + deflate + '-' + process.pid + '.zip');
        fs.writeFileSync(file, zipwriter.build(entries, { deflate }));
        const listed = await run([file, '--list']);
        fs.unlinkSync(file);
        assert.strictEqual(listed.code, 0, 'deflate=' + deflate + ': ' + listed.stderr);
        assert.match(listed.stdout, /get \/ping/);
    }
});

test('query strings in a bruno url are preserved', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: Search', '}', '',
        'get {', '  url: https://api.example.test/search?q=cats&page=2', '}', ''
    ].join('\n'));
    const code = flowgen.generate(doc, 'get', '/search');
    assert.match(code, /msg\.url = "https:\/\/api\.example\.test\/search\?q=cats&page=2";/);
});

test('every bruno http verb is recognised', () => {
    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']) {
        const doc = flowgen.parseDocument([
            'meta {', '  name: X', '}', '',
            method + ' {', '  url: https://api.example.test/thing', '}', ''
        ].join('\n'));
        const list = flowgen.listOperations(doc);
        assert.strictEqual(list.count, 1, method);
        assert.strictEqual(list.operations[0].method, method);
        assert.match(flowgen.generate(doc, method, '/thing'),
            new RegExp('msg\\.method = "' + method.toUpperCase() + '";'));
    }
});

test('a bruno collection builds a flow with the usual four nodes', () => {
    const doc = flowgen.parseDocument(YML);
    const nodes = flowgen.buildFlow(doc, 'get', '/users/1', { tab: false });
    assert.deepStrictEqual(nodes.map(n => n.type),
        ['inject', 'function', 'http request', 'debug']);
    assert.strictEqual(nodes.find(n => n.type === 'http request').ret, 'obj');
    assert.strictEqual(nodes.find(n => n.type === 'function').name, 'GET /users/1');
});

test('a form urlencoded body becomes a flat payload', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: Form', '}', '',
        'post {', '  url: https://api.example.test/form', '  body: formUrlEncoded', '}', '',
        'body:form-urlencoded {', '  user: bruno', '  role: admin', '}', ''
    ].join('\n'));
    const code = flowgen.generate(doc, 'post', '/form');
    assert.match(code, /"user": "bruno"/);
    assert.match(code, /"role": "admin"/);
    assert.ok(!/FILE_CONTENTS/.test(code));
});

test('basic auth produces an authorization header to fill in', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: Basic', '}', '',
        'get {', '  url: https://api.example.test/secret', '  auth: basic', '}', '',
        'auth:basic {', '  username: u', '  password: p', '}', ''
    ].join('\n'));
    const code = flowgen.generate(doc, 'get', '/secret');
    assert.match(code, /"authorization": `Basic \$\{credentials\}`/);
    assert.ok(code.includes('const credentials = Buffer.from("u:p")'),
        'the .bru block already names the credentials, so use them');
});

test('an empty collection is rejected with a clear message', () => {
    assert.throws(() => flowgen.parseCollection([
        { path: 'opencollection.yml', text: 'opencollection: 1.0.0\n' }
    ]), /no requests found/);
});

test('files that are not requests are ignored rather than failing', () => {
    const doc = flowgen.parseCollection([
        { path: 'readme.json', text: '{"unrelated":true}' },
        { path: 'get-user.yml', text: YML }
    ]);
    assert.strictEqual(flowgen.listOperations(doc).count, 1);
});

test('generated bruno code is valid JavaScript', () => {
    const doc = flowgen.parseCollection([
        { path: 'a.bru', text: BRU }, { path: 'b.yml', text: YML }]);
    for (const op of flowgen.listOperations(doc).operations) {
        const code = flowgen.generate(doc, op.method, op.path);
        assert.doesNotThrow(() => new Function(code), op.method + ' ' + op.path);
    }
});

test('the v2 yaml nests auth under http.auth', () => {
    const yml = [
        'info:', '  name: Basic', '  type: http', '',
        'http:', '  method: GET', '  url: https://api.example.test/secret',
        '  auth:', '    type: basic', '    username: u', '    password: "p"', ''
    ].join('\n');
    const code = flowgen.generate(flowgen.parseDocument(yml), 'get', '/secret');
    assert.match(code, /"authorization": `Basic \$\{credentials\}`/);
    assert.ok(code.includes('const credentials = Buffer.from("u:p")'),
        'the collection already knows the credentials, so use them');
});

test('a bearer token in http.auth becomes an authorization header', () => {
    const yml = [
        'info:', '  name: Bearer', '',
        'http:', '  method: GET', '  url: https://api.example.test/me',
        '  auth:', '    type: bearer', '    token: abc123', ''
    ].join('\n');
    assert.match(flowgen.generate(flowgen.parseDocument(yml), 'get', '/me'),
        /"authorization": "Bearer abc123"/);
});

test('an api key in http.auth becomes its own header', () => {
    const yml = [
        'info:', '  name: Key', '',
        'http:', '  method: GET', '  url: https://api.example.test/things',
        '  auth:', '    type: apikey', '    key: X-Api-Key', '    value: ""',
        '    placement: header', ''
    ].join('\n');
    const code = flowgen.generate(flowgen.parseDocument(yml), 'get', '/things');
    assert.match(code, /"X-Api-Key": ""/);
    assert.match(code, /\/\/ Fill in \"X-Api-Key\" below\./);
});

test('an auth block with no recognised type is ignored', () => {
    const yml = [
        'info:', '  name: None', '',
        'http:', '  method: GET', '  url: https://api.example.test/open',
        '  auth:', '    type: none', ''
    ].join('\n');
    const code = flowgen.generate(flowgen.parseDocument(yml), 'get', '/open');
    assert.ok(!/authorization/.test(code));
});

test('a bru text body becomes a string payload', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: Text', '}', '',
        'post {', '  url: https://api.example.test/text', '  body: text', '}', '',
        'body:text {', '  hello world', '}', ''
    ].join('\n'));
    const code = flowgen.generate(doc, 'post', '/text');
    assert.match(code, /msg\.payload = "hello world";/);
});

test('an exported json body is parsed when it is a string', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'J', request: { method: 'POST', url: 'https://t.test/j',
            body: { mode: 'json', json: '{"a":1}' } } }]
    }));
    assert.match(flowgen.generate(doc, 'post', '/j'), /msg\.payload = \{\n    "a": 1\n\};/);
});

test('an exported json body may already be an object', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'J', request: { method: 'POST', url: 'https://t.test/j',
            body: { type: 'json', data: { a: 2 } } } }]
    }));
    assert.match(flowgen.generate(doc, 'post', '/j'), /"a": 2/);
});

test('an unparsable exported json body is kept as text', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'J', request: { method: 'POST', url: 'https://t.test/j',
            body: { mode: 'json', json: 'not json' } } }]
    }));
    assert.match(flowgen.generate(doc, 'post', '/j'), /msg\.payload = "not json";/);
});

test('exported text and form bodies are understood', () => {
    const text = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'T', request: { method: 'POST', url: 'https://t.test/t',
            body: { mode: 'text', data: 'plain' } } }]
    }));
    assert.match(flowgen.generate(text, 'post', '/t'), /msg\.payload = "plain";/);

    const form = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'F', request: { method: 'POST', url: 'https://t.test/f',
            body: { mode: 'formUrlEncoded', data: [
                { name: 'a', value: '1' }, { name: 'skip', value: 'x', enabled: false }] } } }]
    }));
    const code = flowgen.generate(form, 'post', '/f');
    assert.match(code, /"a": "1"/);
    assert.ok(!/skip/.test(code));
});

test('an exported multipart body uses the file upload shape', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'M', request: { method: 'POST', url: 'https://t.test/m',
            body: { mode: 'multipartForm', data: [
                { name: 'file', type: 'file' },
                { name: 'note', value: 'hi' },
                { name: 'off', value: 'x', enabled: false }] } } }]
    }));
    const code = flowgen.generate(doc, 'post', '/m');
    assert.match(code, /"value": FILE_CONTENTS/);
    assert.match(code, /"note": "hi"/);
    assert.ok(!/'off'/.test(code));
});

test('exported headers may be an object and disabled ones are dropped', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'H', request: { method: 'GET', url: 'https://t.test/h',
            headers: { 'X-One': 'a' } } }]
    }));
    assert.match(flowgen.generate(doc, 'get', '/h'), /"X-One": "a"/);

    const arr = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'H', request: { method: 'GET', url: 'https://t.test/h',
            headers: [{ name: 'X-Two', value: 'b' },
                                { name: 'X-Off', value: 'c', enabled: false }] } }]
    }));
    const code = flowgen.generate(arr, 'get', '/h');
    assert.match(code, /"X-Two": "b"/);
    assert.ok(!/X-Off/.test(code));
});

test('nested folders in an export are walked', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'folder', items: [
            { name: 'Deep', request: { method: 'GET', url: 'https://t.test/deep' } }] }]
    }));
    assert.strictEqual(flowgen.listOperations(doc).count, 1);
    assert.match(flowgen.generate(doc, 'get', '/deep'), /t\.test\/deep/);
});

test('a yaml environment file supplies variables', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/dev.yml',
            text: 'vars:\n  - name: host\n    value: https://env.test\n' },
        { path: 'r.yml',
            text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    assert.match(flowgen.generate(doc, 'get', '/ping'), /msg\.url = "https:\/\/env\.test\/ping";/);
});

test('a mapping style environment file also supplies variables', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/dev.yml', text: 'vars:\n  host: https://map.test\n' },
        { path: 'r.yml',
            text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    assert.match(flowgen.generate(doc, 'get', '/ping'), /https:\/\/map\.test\/ping/);
});

test('an unreadable environment file is ignored', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/bad.yml', text: '\tnot: [valid' },
        { path: 'r.yml',
            text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    const id = flowgen.listOperations(doc).operations[0].path;
    assert.strictEqual(id, '{host}/ping');
    assert.match(flowgen.generate(doc, 'get', id), /msg\.url = `\{host\}\/ping`;/);
});

test('collection level vars are read from collection.bru', () => {
    const doc = flowgen.parseCollection([
        { path: 'collection.bru', text: 'vars {\n  host: https://col.test\n}\n' },
        { path: 'r.yml',
            text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    assert.match(flowgen.generate(doc, 'get', '/ping'), /https:\/\/col\.test\/ping/);
});

test('a colon style path variable is shown in braces', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: C', '}', '',
        'get {', '  url: https://api.example.test/users/:id/posts', '}', ''
    ].join('\n'));
    assert.deepStrictEqual(flowgen.listOperations(doc).operations[0].path, '/users/{id}/posts');
    assert.match(flowgen.generate(doc, 'get', '/users/{id}/posts'),
        /msg\.url = `https:\/\/api\.example\.test\/users\/\{id\}\/posts`;/);
});

test('variables are substituted inside the request body', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/local.bru',
            text: 'vars {\n  model: gemma3:270m\n  host: https://ollama.test\n}\n' },
        { path: 'chat.bru', text: [
            'meta {', '  name: Chat', '}', '',
            'post {', '  url: {{host}}/api/chat', '  body: json', '}', '',
            'body:json {',
            '  { "model": "{{model}}", "nested": { "also": "{{model}}" },',
            '    "list": ["{{model}}"], "keep": 1 }',
            '}', ''
        ].join('\n') }
    ]);
    const msg = evaluate(flowgen.generate(doc, 'post', '/api/chat'));
    assert.strictEqual(msg.payload.model, 'gemma3:270m');
    assert.strictEqual(msg.payload.nested.also, 'gemma3:270m');
    assert.deepStrictEqual(msg.payload.list, ['gemma3:270m']);
    assert.strictEqual(msg.payload.keep, 1);
});

test('an undefined variable in the body stays a placeholder', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: C', '}', '',
        'post {', '  url: https://t.test/c', '  body: json', '}', '',
        'body:json {', '  { "model": "{{missing}}" }', '}', ''
    ].join('\n'));
    assert.strictEqual(evaluate(flowgen.generate(doc, 'post', '/c')).payload.model, '{missing}');
});

test('template literal syntax in a url is escaped and not mistaken for a variable', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: X', '}', '',
        'get {', '  url: https://t.test/a${c}/{{real}}/d', '}', ''
    ].join('\n'));
    const id = flowgen.listOperations(doc).operations[0].path;
    const code = flowgen.generate(doc, 'get', id);

    assert.doesNotThrow(() => new Function(code));
    assert.strictEqual(evaluate(code).url, 'https://t.test/a${c}/{real}/d');
    assert.match(code, /\/\/ Replace \{real\} in the URL below with a real value\./);
    assert.ok(!/Replace \{c\}/.test(code), 'a template literal is not a variable');
});

test('a backtick in a url survives the generated string literal', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: B', '}', '',
        'get {', '  url: https://t.test/a`b/c', '}', ''
    ].join('\n'));
    const id = flowgen.listOperations(doc).operations[0].path;
    const code = flowgen.generate(doc, 'get', id);
    assert.doesNotThrow(() => new Function(code));
    assert.strictEqual(evaluate(code).url, 'https://t.test/a`b/c');
});

test('a backslash and newline in a url survive', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: S', '}', '',
        'get {', '  url: https://t.test/a\\b', '}', ''
    ].join('\n'));
    const id = flowgen.listOperations(doc).operations[0].path;
    assert.strictEqual(evaluate(flowgen.generate(doc, 'get', id)).url, 'https://t.test/a\\b');
});

test('a bru body that is not valid JSON is kept as text', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: B', '}', '',
        'post {', '  url: https://t.test/b', '  body: json', '}', '',
        'body:json {', '  { not: valid, json', '}', ''
    ].join('\n'));
    assert.strictEqual(evaluate(flowgen.generate(doc, 'post', '/b')).payload,
        '{ not: valid, json');
});

test('a bearer block with no token falls back to a placeholder', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: B', '}', '',
        'get {', '  url: https://t.test/b', '  auth: bearer', '}', '',
        'auth:bearer {', '  token: ', '}', ''
    ].join('\n'));
    assert.match(flowgen.generate(doc, 'get', '/b'), /"authorization": `Bearer \{token\}`/);
});

test('a multipart file entry without a filename still gets one', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: M', '}', '',
        'post {', '  url: https://t.test/m', '  body: multipartForm', '}', '',
        'body:multipart-form {', '  file: @file()', '}', ''
    ].join('\n'));
    const payload = evaluate(flowgen.generate(doc, 'post', '/m')).payload;
    assert.strictEqual(payload.file.options.filename, 'gray1x1.png');
});

test('lines without a colon are ignored inside a bru block', () => {
    const doc = flowgen.parseDocument([
        'meta {', '  name: X', '}', '',
        'get {', '  url: https://t.test/x', '}', '',
        'headers {', '  just-a-line', '  ~Disabled: no', '  Accept: text/plain', '}', ''
    ].join('\n'));
    const msg = evaluate(flowgen.generate(doc, 'get', '/x'));
    assert.deepStrictEqual(Object.keys(msg.headers), ['Accept']);
});

test('an exported request may sit under request rather than http', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'R', request: { method: 'PUT', url: 'https://t.test/r' } }]
    }));
    assert.match(flowgen.generate(doc, 'put', '/r'), /msg\.method = "PUT";/);
});

test('an exported request defaults to GET when no method is given', () => {
    const doc = flowgen.parseDocument(JSON.stringify({
        items: [{ name: 'R', request: { url: 'https://t.test/r' } }]
    }));
    assert.strictEqual(flowgen.listOperations(doc).operations[0].method, 'get');
});

test('an entry without a url is dropped', () => {
    const doc = flowgen.parseCollection([
        { path: 'a.yml', text: 'info:\n  name: A\nhttp:\n  method: GET\n' },
        { path: 'b.yml', text: 'info:\n  name: B\nhttp:\n  method: GET\n  url: https://t.test/b\n' }
    ]);
    assert.strictEqual(flowgen.listOperations(doc).count, 1);
});

test('an api key auth places its header by default', () => {
    const withPlacement = flowgen.parseDocument([
        'info:', '  name: K', '',
        'http:', '  method: GET', '  url: https://t.test/k',
        '  auth:', '    type: apikey', '    key: X-Key', '    value: ""', ''
    ].join('\n'));
    assert.match(flowgen.generate(withPlacement, 'get', '/k'), /"X-Key": ""/);

    const elsewhere = flowgen.parseDocument([
        'info:', '  name: K', '',
        'http:', '  method: GET', '  url: https://t.test/k',
        '  auth:', '    type: apikey', '    key: X-Key', '    value: ""',
        '    placement: query', ''
    ].join('\n'));
    assert.ok(!/X-Key/.test(flowgen.generate(elsewhere, 'get', '/k')));
});

test('an api key auth without a key name uses a default', () => {
    const doc = flowgen.parseDocument([
        'info:', '  name: K', '',
        'http:', '  method: GET', '  url: https://t.test/k',
        '  auth:', '    type: apikey', '    value: ""', ''
    ].join('\n'));
    assert.match(flowgen.generate(doc, 'get', '/k'), /"api-key": ""/);
});

test('an environment file listing variables under variables is read', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/dev.yml',
          text: 'variables:\n  - name: host\n    value: https://alt.test\n' },
        { path: 'r.yml',
          text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    assert.match(flowgen.generate(doc, 'get', '/ping'), /alt\.test\/ping/);
});

test('an empty environment file is tolerated', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments/empty.yml', text: '' },
        { path: 'r.yml',
          text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: https://t.test/r\n' }
    ]);
    assert.strictEqual(flowgen.listOperations(doc).count, 1);
});

test('a windows style path inside a collection is normalised', () => {
    const doc = flowgen.parseCollection([
        { path: 'environments\\local.bru', text: 'vars {\n  host: https://win.test\n}\n' },
        { path: 'sub\\r.yml',
          text: 'info:\n  name: R\nhttp:\n  method: GET\n  url: "{{host}}/ping"\n' }
    ]);
    assert.match(flowgen.generate(doc, 'get', '/ping'), /win\.test\/ping/);
});
