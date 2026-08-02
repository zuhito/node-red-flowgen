'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');
const specs = require('./specs');

let doc;

let target;
let targetPort;
let userDir;
let redServer;
const received = [];

function fill(code, base, values) {
  let out = code.replace(/`https?:\/\/[^`]*`/, match => {
    const url = match.slice(1, -1);
    const rest = url.replace(/^https?:\/\/[^/]+/, '');
    return '`' + base + rest + '`';
  });
  for (const [key, value] of Object.entries(values)) {
    out = out.split('{' + key + '}').join(value);
    out = out.split("'" + key + "': ``").join("'" + key + "': " + JSON.stringify(value));
    out = out.split(key + '=').join(key + '=' + value);
  }
  return out;
}

function flowFor(code) {
  return [
    { id: 'tab', type: 'tab', label: 'test' },
    {
      id: 'n1', type: 'inject', z: 'tab', once: true, onceDelay: 0.1,
      payload: '', payloadType: 'date', wires: [['n2']]
    },
    { id: 'n2', type: 'function', z: 'tab', func: code, outputs: 1, wires: [['n3']] },
    {
      id: 'n3', type: 'http request', z: 'tab', method: 'use', ret: 'txt',
      paytoqs: 'ignore', url: '', persist: false, headers: [], wires: [['n4']]
    },
    { id: 'n4', type: 'debug', z: 'tab', complete: 'payload', wires: [] }
  ];
}

function autoFire(flow) {
  const copy = JSON.parse(JSON.stringify(flow));
  for (const node of copy) {
    if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
    if (node.type === 'function') {
      node.func = fill(node.func, 'http://127.0.0.1:' + targetPort, { petId: 42 });
    }
  }
  return copy;
}

async function runRaw(flow) {
  received.length = 0;
  fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(flow));
  await RED.nodes.loadFlows(true);
  const start = Date.now();
  while (received.length === 0 && Date.now() - start < 8000) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.strictEqual(received.length, 1, 'no request reached the server');
  return received[0];
}

async function runFlow(code) {
  received.length = 0;
  fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(flowFor(code)));
  await RED.nodes.loadFlows(true);
  const start = Date.now();
  while (received.length === 0 && Date.now() - start < 8000) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.strictEqual(received.length, 1, 'no request reached the server');
  return received[0];
}

before(async () => {
  doc = flowgen.parseDocument(await specs.spec('v3'));

  const app = express();
  app.use((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8')
      });
      res.setHeader('content-type', 'application/json');
      res.end('{"ok":true}');
    });
  });
  target = http.createServer(app);
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  targetPort = target.address().port;

  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-'));
  const redApp = express();
  redServer = http.createServer(redApp);
  RED.init(redServer, {
    httpAdminRoot: false,
    httpNodeRoot: false,
    userDir: userDir,
    flowFile: 'flows.json',
    logging: { console: { level: 'fatal', metrics: false, audit: false } }
  });
  fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
  await new Promise(resolve => redServer.listen(0, '127.0.0.1', resolve));
  await RED.start();
});

after(async () => {
  await RED.stop();
  await new Promise(resolve => redServer.close(resolve));
  await new Promise(resolve => target.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
});

test('GET with an apiKey header parameter', async () => {
  const code = flowgen.generate(doc, 'get', '/pet/{petId}');
  const got = await runFlow(fill(code, 'http://127.0.0.1:' + targetPort, { petId: 10, api_key: 'secret' }));
  assert.strictEqual(got.method, 'GET');
  assert.strictEqual(got.url, '/api/v3/pet/10');
  assert.strictEqual(got.headers.api_key, 'secret');
  assert.strictEqual(got.headers.accept, 'application/json');
});

test('GET with query parameters', async () => {
  const code = flowgen.generate(doc, 'get', '/pet/findByStatus');
  const got = await runFlow(fill(code, 'http://127.0.0.1:' + targetPort, {}));
  assert.strictEqual(got.method, 'GET');
  assert.strictEqual(got.url, '/api/v3/pet/findByStatus?status=available',
    'the enum value from the spec is filled in');
  assert.match(got.headers.authorization, /^Bearer/);
});

test('POST with a JSON body', async () => {
  const code = flowgen.generate(doc, 'post', '/pet');
  const got = await runFlow(fill(code, 'http://127.0.0.1:' + targetPort, {}));
  assert.strictEqual(got.method, 'POST');
  assert.strictEqual(got.url, '/api/v3/pet');
  assert.match(got.headers['content-type'], /application\/json/);
  assert.strictEqual(JSON.parse(got.body).name, 'doggie');
});

test('POST with form parameters', async () => {
  const code = flowgen.generate(doc, 'post', '/pet/{petId}');
  const filled = fill(code, 'http://127.0.0.1:' + targetPort, { petId: 7 })
    .split('{name}').join('rex').split('{status}').join('sold');
  const got = await runFlow(filled);
  assert.strictEqual(got.method, 'POST');
  assert.match(got.url, /^\/api\/v3\/pet\/7\?name=rex&status=sold/);
});

test('DELETE with a path parameter', async () => {
  const code = flowgen.generate(doc, 'delete', '/store/order/{orderId}');
  const got = await runFlow(fill(code, 'http://127.0.0.1:' + targetPort, { orderId: 3 }));
  assert.strictEqual(got.method, 'DELETE');
  assert.strictEqual(got.url, '/api/v3/store/order/3');
});

test('cookies are sent when the operation declares them', async () => {
  const spec = {
    openapi: '3.0.3',
    info: { title: 'C', version: '1' },
    servers: [{ url: 'http://127.0.0.1:' + targetPort + '/base' }],
    components: { securitySchemes: { s: { type: 'apiKey', in: 'cookie', name: 'SESSION' } } },
    paths: { '/c': { get: { security: [{ s: [] }], parameters: [{ name: 'sid', in: 'cookie' }] } } }
  };
  const code = flowgen.generate(spec, 'get', '/c');
  const got = await runFlow(fill(code, 'http://127.0.0.1:' + targetPort, { sid: 'a1', SESSION: 'b2' }));
  assert.strictEqual(got.url, '/base/c');
  assert.match(got.headers.cookie, /sid=a1/);
  assert.match(got.headers.cookie, /SESSION=b2/);
});

test('--flow output loads into Node-RED and issues the request', async () => {
  const flow = flowgen.buildFlow(doc, 'get', '/pet/{petId}');
  const got = await runRaw(autoFire(flow));
  assert.strictEqual(got.method, 'GET');
  assert.strictEqual(got.url, '/api/v3/pet/42');
  assert.strictEqual(got.headers.accept, 'application/json');
});

test('--flow output survives a JSON round trip and posts a body', async () => {
  const flow = JSON.parse(JSON.stringify(flowgen.buildFlow(doc, 'post', '/pet')));
  const got = await runRaw(autoFire(flow));
  assert.strictEqual(got.method, 'POST');
  assert.strictEqual(got.url, '/api/v3/pet');
  assert.strictEqual(JSON.parse(got.body).name, 'doggie');
});
