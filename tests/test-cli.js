'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const specs = require('./specs');

let server, base;

const run = args => new Promise(resolve =>
  execFile('node', [path.join(__dirname, '..', 'flowgen.js')].concat(args),
    (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

before(async () => {
  const spec = JSON.stringify(yaml.load(await specs.spec('v2')));
  server = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/swagger.json' });
      return res.end();
    }
    if (req.url === '/swagger.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(spec);
    }
    res.writeHead(404).end('nope');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

test('a url can be given instead of a file', async () => {
  const listed = await run([base + '/swagger.json', '--list']);
  assert.strictEqual(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /post \/pet/);

  const code = await run([base + '/swagger.json', 'get', '/pet/findByStatus']);
  assert.strictEqual(code.code, 0, code.stderr);
  assert.match(code.stdout, /msg\.url = `http:\/\/petstore\.swagger\.io\/v2\/pet\/findByStatus\?status=available`;/);
});

test('redirects are followed', async () => {
  const result = await run([base + '/redirect', '--list']);
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /post \/pet/);
});

test('a failing url reports the status and exits non zero', async () => {
  const result = await run([base + '/missing', '--list']);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /HTTP 404/);
});

test('--flow works from a url too', async () => {
  const result = await run([base + '/swagger.json', 'get', '/pet/findByStatus', '--flow']);
  assert.strictEqual(result.code, 0, result.stderr);
  const flow = JSON.parse(result.stdout);
  assert.strictEqual(flow.map(n => n.type).join(','), 'tab,inject,function,http request,debug');
});

test('the usage text is printed with no arguments and exits non zero', async () => {
  const result = await run([]);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /usage:/);
  assert.match(result.stderr, /node-red-flowgen <spec/);
  assert.ok(!/node flowgen\.js/.test(result.stderr), 'the CLI advertises its installed name');
});

test('an unknown path lists the available operations', async () => {
  const file = await specs.specFile('v2');
  const result = await run([file, 'get', '/nope']);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /not found/);
  assert.match(result.stderr, /available:/);
  assert.match(result.stderr, /get \/store\/inventory/);
});

test('a missing file reports an error rather than throwing', async () => {
  const result = await run(['/nonexistent/spec.yaml', '--list']);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /ENOENT|no such file/i);
});

test('an unparsable document is reported clearly', async () => {
  const file = path.join(os.tmpdir(), 'bad-' + process.pid + '.yaml');
  fs.writeFileSync(file, 'just: a\nplain: mapping\n');
  const result = await run([file, '--list']);
  fs.unlinkSync(file);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /unknown format|no requests/);
});

test('--list output lines can be fed straight back as arguments', async () => {
  const file = await specs.specFile('v3');
  const listed = await run([file, '--list']);
  assert.strictEqual(listed.code, 0);

  const lines = listed.stdout.trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 5);
  for (const line of lines.slice(0, 6)) {
    const [method, target] = line.replace(/\s*#.*/, '').trim().split(/\s+/);
    const generated = await run([file, method, target]);
    assert.strictEqual(generated.code, 0, line + ' -> ' + generated.stderr);
    assert.match(generated.stdout, /^msg\.method = `/);
    assert.match(generated.stdout, /return msg;/);
  }
});

test('the short flags behave like the long ones', async () => {
  const file = await specs.specFile('v2');
  const long = await run([file, '--list']);
  const short = await run([file, '-l']);
  assert.strictEqual(short.stdout, long.stdout);

  const flowLong = await run([file, 'get', '/store/inventory', '--flow']);
  const flowShort = await run([file, 'get', '/store/inventory', '-f']);
  assert.strictEqual(flowShort.stdout, flowLong.stdout);
});

test('deprecated operations are refused by the CLI', async () => {
  const file = await specs.specFile('v2');
  const listed = await run([file, '--list']);
  assert.ok(!/findByTags/.test(listed.stdout));
  const result = await run([file, 'get', '/pet/findByTags']);
  assert.strictEqual(result.code, 1);
  assert.ok(!/findByTags/.test(result.stderr.split('available:')[1] || ''));
});

test('a single bru file can be given to the CLI', async () => {
  const file = path.join(os.tmpdir(), 'one-' + process.pid + '.bru');
  fs.writeFileSync(file, [
    'meta {', '  name: Ping', '}', '',
    'get {', '  url: https://api.example.test/ping', '}', ''
  ].join('\n'));

  const listed = await run([file, '--list']);
  assert.strictEqual(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /get \/ping\s+# Ping/);

  const generated = await run([file, 'get', '/ping']);
  fs.unlinkSync(file);
  assert.strictEqual(generated.code, 0, generated.stderr);
  assert.match(generated.stdout, /msg\.url = `https:\/\/api\.example\.test\/ping`;/);
});
