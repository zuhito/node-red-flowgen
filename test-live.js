'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const RED = require('node-red');
const flowgen = require('./flowgen');

const SPEC = path.join(__dirname, 'spec', 'petstore-v3.yaml');
const doc = flowgen.parseDocument(fs.readFileSync(SPEC, 'utf8'));

const BASE = process.env.PETSTORE_BASE || '';

const CASES = [
  { method: 'get', path: '/pet/{petId}', fill: { petId: '1' } },
  { method: 'get', path: '/pet/findByStatus', fill: { status: 'available' } },
  { method: 'get', path: '/store/inventory', fill: {} }
];

function fill(code, values) {
  let out = code;
  if (BASE) {
    out = out.replace(/'https?:\/\/[^']*'/, function (match) {
      return "'" + BASE + match.slice(1, -1).replace(/^https?:\/\/[^/]+/, '') + "'";
    });
  }
  for (const [key, value] of Object.entries(values)) {
    out = out.split('{' + key + '}').join(value);
    out = out.split(key + '=').join(key + '=' + value);
  }
  return out;
}

function note(level, text) {
  process.stdout.write('::' + level + '::' + String(text).replace(/\r?\n/g, ' ') + '\n');
}

async function main() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-live-'));
  const app = express();
  const server = http.createServer(app);
  RED.init(server, {
    httpAdminRoot: false,
    httpNodeRoot: false,
    userDir: userDir,
    flowFile: 'flows.json',
    logging: { console: { level: 'fatal', metrics: false, audit: false } }
  });
  fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await RED.start();

  let failures = 0;

  for (const testCase of CASES) {
    const label = testCase.method.toUpperCase() + ' ' + testCase.path;
    const nodes = flowgen.buildFlow(doc, testCase.method, testCase.path);
    for (const node of nodes) {
      if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
      if (node.type === 'function') { node.func = fill(node.func, testCase.fill); }
      if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
    }

    const hook = nodes.find(n => n.type === 'debug');
    hook.type = 'function';
    hook.name = 'probe';
    hook.outputs = 1;
    hook.wires = [[]];
    hook.func = "global.set('flowgenResult', { status: msg.statusCode, payload: msg.payload });\nreturn msg;";

    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
    await RED.nodes.loadFlows(true);

    let probe = null;
    for (let i = 0; i < 50 && !probe; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      probe = RED.nodes.getNode(hook.id);
    }
    if (!probe) { note('error', label + ' -> probe node never started'); failures++; continue; }
    const context = probe.context().global;
    context.set('flowgenResult', null);

    const started = Date.now();
    let result = null;
    while (!result && Date.now() - started < 30000) {
      await new Promise(resolve => setTimeout(resolve, 200));
      result = context.get('flowgenResult');
    }
    result = result || { status: null, payload: 'timeout' };

    const body = JSON.stringify(result.payload).slice(0, 200);
    if (result.status >= 200 && result.status < 400) {
      note('notice', label + ' -> HTTP ' + result.status);
    } else if (result.status >= 500) {
      note('notice', label + ' -> HTTP ' + result.status +
        ' (upstream demo server error, not a generation fault) ' + body);
    } else if (result.status) {
      failures++;
      note('error', label + ' -> HTTP ' + result.status +
        ' (the generated request was rejected) ' + body);
    } else {
      failures++;
      note('error', label + ' -> no response: ' + body);
    }
  }

  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch(err => { note('error', 'live test crashed: ' + err.message); process.exit(1); });
