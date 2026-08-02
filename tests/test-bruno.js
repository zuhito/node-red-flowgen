'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const yazl = null;
const zipwriter = require('./zipwriter');
const flowgen = require('../flowgen');

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
  assert.match(code, /msg\.url = `https:\/\/api\.example\.test\/users\?verbose=true`;/);
  assert.match(code, /'X-Trace': `abc`/);
  assert.ok(!/X-Off/.test(code), 'disabled headers are skipped');
  assert.match(code, /'authorization': `Bearer \{token\}`/);
  assert.match(code, /msg\.payload = \{\n  'name': `rex`\n\};/);
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
  assert.match(code, /msg\.url = `https:\/\/api\.example\.test\/users\/1`;/);
  assert.match(code, /'Accept': `application\/json`/);
});

test('duplicate method and path pairs get distinct identifiers', () => {
  const twice = YML.replace('Get user', 'Second');
  const doc = flowgen.parseCollection([
    { path: 'a.yml', text: YML }, { path: 'b.yml', text: twice }]);
  const paths = flowgen.listOperations(doc).operations.map(o => o.path);
  assert.deepStrictEqual(paths, ['/users/1', '/users/1#2']);
  assert.match(flowgen.generate(doc, 'get', '/users/1#2'), /msg\.method = `GET`;/);
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
  assert.match(code, /msg\.url = `https:\/\/api\.example\.test\/ping`;/);
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
  assert.match(code, /'value': `FILE_CONTENTS`/);
  assert.match(code, /'filename': `photo.png`/);
  assert.match(code, /'note': `hello`/);
  assert.match(code, /\/\/ Set FILE_CONTENTS and the filename/);
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
