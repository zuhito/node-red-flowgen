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
    cwd: __dirname, encoding: 'utf8'
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
  assert.ok(fs.existsSync(path.join(installed, 'plugin', 'flowgen-plugin.js')));
  assert.ok(fs.existsSync(path.join(installed, 'plugin', 'flowgen-plugin.html')));
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
  assert.ok(res.body.startsWith('(function (root'), 'not the UMD build');
  assert.strictEqual(res.body, fs.readFileSync(path.join(__dirname, 'flowgen.js'), 'utf8'));
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

  const spec = fs.readFileSync(path.join(__dirname, 'spec', 'petstore-v3.yaml'), 'utf8');
  const doc = self.flowgen.parseDocument(spec);
  assert.strictEqual(self.flowgen.detectFormat(doc), 'openapi3');

  const list = self.flowgen.listOperations(doc);
  assert.ok(list.count > 0);

  const flow = self.flowgen.buildFlow(doc, 'get', '/pet/{petId}');
  assert.strictEqual(flow.map(n => n.type).join(','),
    'tab,inject,function,http request,debug');
  assert.match(flow.find(n => n.type === 'function').func, /msg\.url = /);
});
