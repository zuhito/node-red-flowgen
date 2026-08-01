'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const express = require('express');
const RED = require('node-red');

let userDir;
let server;
let port;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + port + urlPath, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

before(async () => {
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-plugin-'));

  const packed = execFileSync('npm', ['pack', '--pack-destination', userDir], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8'
  }).trim().split('\n').pop();
  const tgz = path.join(userDir, packed);
  assert.ok(fs.existsSync(tgz), 'npm pack did not produce ' + tgz);

  fs.writeFileSync(path.join(userDir, 'package.json'), JSON.stringify({ name: 'nr-test' }));
  execFileSync('npm', ['install', tgz, '--no-audit', '--no-fund'], { cwd: userDir, stdio: 'pipe' });

  const app = express();
  server = http.createServer(app);
  RED.init(server, {
    httpAdminRoot: '/',
    httpNodeRoot: false,
    userDir: userDir,
    flowFile: 'flows.json',
    logging: { console: { level: 'fatal', metrics: false, audit: false } }
  });
  app.use('/', RED.httpAdmin);
  fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  await RED.start();
});

after(async () => {
  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
});

test('the packed module installs into Node-RED', () => {
  const installed = path.join(userDir, 'node_modules', 'node-red-flowgen');
  assert.ok(fs.existsSync(path.join(installed, 'flowgen.js')));
  assert.ok(fs.existsSync(path.join(installed, 'flowgen-plugin.js')));
  assert.ok(fs.existsSync(path.join(installed, 'flowgen-plugin.html')));
});

test('the plugin runtime is loaded by Node-RED', async () => {
  const res = await get('/flowgen/flowgen.js');
  assert.strictEqual(res.status, 200,
    'the asset route only exists if the plugin runtime ran');
});

test('the editor receives the plugin markup', async () => {
  const res = await get('/plugins');
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /red-ui-clipboard-dialog-import-tab-apispec/);
  assert.match(res.body, /API Spec/);
  assert.match(res.body, /registerPlugin\('node-red-flowgen'/);
});

test('the shared flowgen.js is served to the browser', async () => {
  const res = await get('/flowgen/flowgen.js');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.replace(/^#![^\n]*\n/, '').startsWith('(function (root'), 'not the UMD build');
  assert.strictEqual(res.body,
    fs.readFileSync(path.join(__dirname, '..', 'flowgen.js'), 'utf8'));
});

test('js-yaml is served for browser side parsing', async () => {
  const res = await get('/flowgen/js-yaml.min.js');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length > 1000);
});

test('unknown assets are rejected', async () => {
  assert.strictEqual((await get('/flowgen/nope.js')).status, 404);
});

test('the served flowgen.js works when evaluated as browser code', async () => {
  const vm = require('vm');
  const source = (await get('/flowgen/flowgen.js')).body;
  const self = { jsyaml: require('js-yaml') };
  self.self = self;
  vm.runInNewContext(source, self);

  const doc = self.flowgen.parseDocument(await require('./specs').spec('v3'));
  assert.strictEqual(self.flowgen.detectFormat(doc), 'openapi3');

  const list = self.flowgen.listOperations(doc);
  assert.ok(list.count > 0);

  const flow = self.flowgen.buildFlow(doc, 'get', '/pet/{petId}');
  assert.strictEqual(flow.map(n => n.type).join(','),
    'tab,inject,function,http request,debug');
  assert.match(flow.find(n => n.type === 'function').func, /msg\.url = /);
});

test('the editor payload pulls nothing from the internet', async () => {
  const res = await get('/plugins');
  assert.ok(!/src\s*=\s*["']https?:/.test(res.body), 'no external scripts');
  assert.ok(!/href\s*=\s*["']https?:/.test(res.body), 'no external stylesheets');
  assert.ok(!/@import\s+url\(\s*["']?https?:/.test(res.body), 'no external CSS imports');
});

test('everything the browser loads is served by the local admin server', async () => {
  for (const asset of ['flowgen.js', 'js-yaml.min.js']) {
    const res = await get('/flowgen/' + asset);
    assert.strictEqual(res.status, 200, asset + ' must come from the local server');
    assert.ok(res.body.length > 1000);
  }
});

test('the installed package resolves js-yaml from its own node_modules', () => {
  const installed = path.join(userDir, 'node_modules', 'node-red-flowgen');
  const pkg = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(pkg.dependencies).sort(), ['adm-zip', 'js-yaml'],
    'runtime dependencies ship at install time');
  const plugin = fs.readFileSync(path.join(installed, 'flowgen-plugin.js'), 'utf8');
  assert.ok(!/https?:\/\//.test(plugin), 'the runtime never references a remote URL');
});

test('the collection endpoint clones a git url and returns its files', async () => {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-ep-git-'));
  fs.writeFileSync(path.join(repo, 'get-user.yml'),
    'info:\n  name: Get user\nhttp:\n  method: GET\n  url: https://api.example.test/users/1\n');
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '-A']);
  execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x']);

  execFileSync('git', ['-C', repo, 'update-server-info']);
  const statics = express();
  statics.use(express.static(repo, { dotfiles: 'allow' }));
  const gitServer = http.createServer(statics);
  await new Promise(resolve => gitServer.listen(0, '127.0.0.1', resolve));
  const gitUrl = 'http://127.0.0.1:' + gitServer.address().port + '/.git';

  const res = await get('/flowgen/collection?url=' + encodeURIComponent(gitUrl));
  await new Promise(resolve => gitServer.close(resolve));
  fs.rmSync(repo, { recursive: true, force: true });
  assert.strictEqual(res.status, 200, res.body);
  const files = JSON.parse(res.body).files;
  assert.ok(files.some(f => f.path === 'get-user.yml'));
});

test('the collection endpoint rejects non http sources', async () => {
  for (const bad of ['file:///etc/passwd', 'notaurl', '']) {
    const res = await get('/flowgen/collection?url=' + encodeURIComponent(bad));
    assert.strictEqual(res.status, 400, bad);
    assert.match(JSON.parse(res.body).error, /http/);
  }
});

test('the collection endpoint proxies plain spec urls, following redirects', async () => {
  const upstream = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/spec.yaml' });
      return res.end();
    }
    if (req.url === '/spec.yaml') {
      res.writeHead(200, { 'content-type': 'text/yaml' });
      return res.end('openapi: 3.0.0\n');
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + upstream.address().port;

  const direct = await get('/flowgen/collection?url=' + encodeURIComponent(base + '/spec.yaml'));
  assert.strictEqual(direct.status, 200, direct.body);
  assert.strictEqual(JSON.parse(direct.body).text, 'openapi: 3.0.0\n');

  const redirected = await get('/flowgen/collection?url=' + encodeURIComponent(base + '/redirect'));
  assert.strictEqual(redirected.status, 200, redirected.body);
  assert.strictEqual(JSON.parse(redirected.body).text, 'openapi: 3.0.0\n');

  const missing = await get('/flowgen/collection?url=' + encodeURIComponent(base + '/nope'));
  assert.strictEqual(missing.status, 502);
  assert.match(JSON.parse(missing.body).error, /HTTP 404/);

  await new Promise(resolve => upstream.close(resolve));
});

test('the collection endpoint unpacks an uploaded zip', async () => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addFile('req.bru', Buffer.from(
    'meta {\n  name: Ping\n}\n\nget {\n  url: https://api.example.test/ping\n}\n'));
  zip.addFile('.git/config', Buffer.from('ignored'));
  const body = zip.toBuffer();

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: port, path: '/flowgen/collection', method: 'POST',
      headers: { 'content-type': 'application/zip', 'content-length': body.length }
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
  assert.strictEqual(res.status, 200, res.body);
  const files = JSON.parse(res.body).files;
  assert.deepStrictEqual(files.map(f => f.path), ['req.bru']);
  assert.match(files[0].text, /api\.example\.test\/ping/);
});
