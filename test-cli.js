'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const yaml = require('js-yaml');
const { execFile } = require('child_process');

let server, base;

const run = args => new Promise(resolve =>
  execFile('node', [path.join(__dirname, 'flowgen.js')].concat(args),
    (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

before(async () => {
  const spec = JSON.stringify(yaml.load(
    fs.readFileSync(path.join(__dirname, 'spec', 'petstore-v2.yaml'), 'utf8')));
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
  assert.match(code.stdout, /msg\.url = 'http:\/\/petstore\.swagger\.io\/v2\/pet\/findByStatus\?status=available';/);
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
