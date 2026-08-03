'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');

const ONLY = process.env.LIVE_ONLY || '';

const SPEC_SOURCES = [
  { name: 'petstore-v2', url: 'https://petstore.swagger.io/v2/swagger.json' },
  { name: 'petstore-v3', url: 'https://petstore3.swagger.io/api/v3/openapi.json' },
  { name: 'httpbin', url: 'https://httpbin.org/spec.json' }
];

const BRUNO_SOURCES = [
  { name: 'bruno-starter-guide',
    git: 'https://github.com/bruno-collections/bruno-starter-guide.git' }
];

const CASES = [
  { source: 'petstore-v2', method: 'get', path: '/store/inventory' },
  { source: 'petstore-v2', method: 'get', path: '/pet/findByStatus' },
  { source: 'petstore-v2', method: 'get', path: '/pet/{petId}', fill: { petId: '1' } },
  { source: 'petstore-v3', method: 'get', path: '/pet/{petId}', fill: { petId: '1' } },
  { source: 'petstore-v3', method: 'get', path: '/pet/findByStatus' },
  { source: 'httpbin', method: 'get', path: '/get' },
  { source: 'httpbin', method: 'get', path: '/headers' },
  { source: 'httpbin', method: 'get', path: '/response-headers' },
  { source: 'httpbin', method: 'post', path: '/post' },
  { source: 'httpbin', method: 'get', path: '/status/{codes}', fill: { codes: '200' } },
  { source: 'httpbin', method: 'get', path: '/bearer', expect: 401 },
  { source: 'bruno-starter-guide', method: 'get', path: '/users/usebruno' },
  { source: 'bruno-starter-guide', method: 'get', path: '/basic-auth/usebruno/1234',
    expect: 401 }
];

function note(level, text) {
  process.stdout.write('::' + level + '::' + String(text).replace(/\r?\n/g, ' ') + '\n');
}

function download(url, redirects) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    mod.get(url, { headers: { 'user-agent': 'flowgen-live' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('too many redirects'));
        return download(new URL(res.headers.location, url).toString(), redirects - 1)
          .then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function gather(root) {
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(bru|ya?ml|json)$/.test(entry.name)) {
        files.push({ path: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

function applyFill(code, fill) {
  let out = code;
  for (const [key, value] of Object.entries(fill || {})) {
    out = out.split('{' + key + '}').join(value);
  }
  return out;
}

async function loadSources() {
  const docs = {};
  for (const source of SPEC_SOURCES) {
    try {
      docs[source.name] = flowgen.parseDocument(await download(source.url, 5));
      note('notice', 'loaded ' + source.name + ' from ' + source.url);
    } catch (err) {
      note('notice', 'could not load ' + source.name + ': ' + err.message);
    }
  }
  const { execFileSync } = require('child_process');
  for (const source of BRUNO_SOURCES) {
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-git-'));
      execFileSync('git', ['clone', '--quiet', '--depth', '1', source.git, tmp],
        { stdio: 'pipe' });
      docs[source.name] = flowgen.parseCollection(gather(tmp));
      fs.rmSync(tmp, { recursive: true, force: true });
      note('notice', 'loaded ' + source.name + ' from ' + source.git);
    } catch (err) {
      note('notice', 'could not load ' + source.name + ': ' + err.message);
    }
  }
  return docs;
}

async function main() {
  const docs = await loadSources();
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
  let ran = 0;

  for (const testCase of CASES) {
    const label = testCase.source + ' ' + testCase.method.toUpperCase() + ' ' + testCase.path;
    if (ONLY && label.indexOf(ONLY) === -1) continue;
    const doc = docs[testCase.source];
    if (!doc) { note('notice', label + ' -> skipped, source unavailable'); continue; }

    let nodes;
    try {
      nodes = flowgen.buildFlow(doc, testCase.method, testCase.path);
    } catch (err) {
      failures++;
      note('error', label + ' -> generation failed: ' + err.message);
      continue;
    }
    ran++;

    for (const node of nodes) {
      if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
      if (node.type === 'function') { node.func = applyFill(node.func, testCase.fill); }
      if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
    }
    const probe = nodes.find(n => n.type === 'debug');
    probe.type = 'function';
    probe.name = 'probe';
    probe.outputs = 1;
    probe.wires = [[]];
    probe.func = "global.set('liveResult', { status: msg.statusCode });\nreturn msg;";

    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
    await RED.nodes.loadFlows(true);

    let node = null;
    for (let i = 0; i < 50 && !node; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      node = RED.nodes.getNode(probe.id);
    }
    if (!node) { failures++; note('error', label + ' -> probe never started'); continue; }
    const context = node.context().global;
    context.set('liveResult', null);

    const started = Date.now();
    let result = null;
    while (!result && Date.now() - started < 30000) {
      await new Promise(resolve => setTimeout(resolve, 200));
      result = context.get('liveResult');
    }
    result = result || { status: null };

    const expected = testCase.expect;
    if (expected && result.status === expected) {
      note('notice', label + ' -> HTTP ' + result.status + ' (as expected)');
    } else if (result.status >= 200 && result.status < 400) {
      note('notice', label + ' -> HTTP ' + result.status);
    } else if (result.status >= 500) {
      note('notice', label + ' -> HTTP ' + result.status +
        ' (upstream error, not a generation fault)');
    } else if (result.status) {
      failures++;
      note('error', label + ' -> HTTP ' + result.status +
        ' (the generated request was rejected)');
    } else {
      failures++;
      note('error', label + ' -> no response within 30s');
    }
  }

  note('notice', 'live cases run: ' + ran + ', failures: ' + failures);
  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch(err => { note('error', 'live run crashed: ' + err.message); process.exit(1); });
