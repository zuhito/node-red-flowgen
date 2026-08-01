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

const CASES = [
  { method: 'get', path: '/store/inventory', fill: {} },
  { method: 'get', path: '/pet/findByStatus', fill: { status: 'available' } },
  { method: 'get', path: '/pet/{petId}', fill: { petId: '1' } }
];

function fill(code, values) {
  let out = code;
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

    const result = await new Promise(resolve => {
      const done = value => { RED.events.removeListener('flowgen:result', handler); resolve(value); };
      const handler = value => done(value);
      RED.events.once('flowgen:result', handler);

      const debugNode = nodes.find(n => n.type === 'debug');
      nodes.splice(nodes.indexOf(debugNode), 1);
      const hook = {
        id: 'flowgen-probe', type: 'function', z: nodes[0].id,
        name: 'probe', outputs: 1, wires: [[]],
        func: 'return msg;', x: 860, y: 100
      };
      nodes.push(hook);
      nodes.find(n => n.type === 'http request').wires = [[hook.id]];

      fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
      RED.nodes.loadFlows(true).then(() => {
        const node = RED.nodes.getNode(hook.id);
        if (node) {
          node.on('input', msg => done({ status: msg.statusCode, payload: msg.payload }));
        }
        setTimeout(() => done({ status: null, payload: 'timeout' }), 25000);
      });
    });

    if (result.status && result.status >= 200 && result.status < 400) {
      note('notice', label + ' -> HTTP ' + result.status);
    } else {
      failures++;
      note('error', label + ' -> HTTP ' + result.status + ' body=' +
        JSON.stringify(result.payload).slice(0, 300));
    }
  }

  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch(err => { note('error', 'live test crashed: ' + err.message); process.exit(1); });
