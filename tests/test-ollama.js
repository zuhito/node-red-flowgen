'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');
const { spawn, execFileSync } = require('child_process');
const flowgen = require('../flowgen');

const SPECS = path.join(__dirname, '..', 'specs');
const MODEL = process.env.OLLAMA_MODEL || 'gemma3:270m';
const READ_ONLY = process.env.OLLAMA_READ_ONLY === '1';

let ollama = null;
let baseUrl = '';
let userDir;
let redServer;

function collectionFiles(dir) {
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push({ path: path.relative(dir, full), text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return files;
}

const DOCS = {
  openapi3: () => flowgen.parseDocument(
    fs.readFileSync(path.join(SPECS, 'ollama-openapi3.yaml'), 'utf8')),
  swagger2: () => flowgen.parseDocument(
    fs.readFileSync(path.join(SPECS, 'ollama-swagger2.yaml'), 'utf8')),
  bruno: () => flowgen.parseCollection(collectionFiles(path.join(SPECS, 'ollama-bruno')))
};

const VARIATIONS = {
  '/api/generate': [
    { stream: false, options: { num_predict: 4, seed: 1, temperature: 0 } },
    { stream: false, raw: true, options: { num_predict: 4 } },
    { stream: false, format: 'json', options: { num_predict: 8 } },
    { stream: false, system: 'Answer briefly.', options: { num_predict: 4, top_k: 5 } },
    { stream: false, suffix: '', options: { num_predict: 4, top_p: 0.5, stop: ['\n'] } },
    { stream: false, keep_alive: '30s', options: { num_ctx: 512, num_predict: 4 } }
  ],
  '/api/chat': [
    { stream: false, options: { num_predict: 4, seed: 1, temperature: 0 } },
    { stream: false, format: 'json', options: { num_predict: 8 } },
    { stream: false, keep_alive: '30s', options: { num_predict: 4 } }
  ],
  '/api/embed': [
    { truncate: true },
    { truncate: false },
    { keep_alive: '30s' }
  ],
  '/api/embeddings': [{}],
  '/api/show': [{ verbose: false }, { verbose: true }],
  '/api/tags': [{}],
  '/api/ps': [{}],
  '/api/version': [{}],
  '/v1/models': [{}],
  '/v1/chat/completions': [
    { stream: false, max_tokens: 4, temperature: 0 },
    { stream: false, max_tokens: 8, seed: 1 }
  ],
  '/v1/completions': [{ stream: false, max_tokens: 4 }],
  '/v1/embeddings': [{}]
};

const WRITE_PATHS = ['/api/copy', '/api/delete', '/api/pull', '/api/push', '/api/create'];

function tidy(payload, path) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = JSON.parse(JSON.stringify(payload));
  if ('model' in out) out.model = MODEL;
  if (Array.isArray(out.images)) delete out.images;
  if (Array.isArray(out.context)) delete out.context;
  if (Array.isArray(out.tools)) delete out.tools;
  if (out.messages) {
    out.messages = [{ role: 'user', content: 'Reply with the single word ok.' }];
  }
  if (typeof out.template === 'string' && !out.template) delete out.template;
  if (typeof out.system === 'string' && !out.system) delete out.system;
  if (typeof out.suffix === 'string' && !out.suffix) delete out.suffix;
  if (out.options && Array.isArray(out.options.stop) &&
      out.options.stop.every(s => s === '')) delete out.options.stop;
  if (path === '/api/embed' && !out.input) out.input = 'hello';
  if (path === '/api/embeddings' && !out.prompt) out.prompt = 'hello';
  if (path === '/v1/embeddings' && !out.input) out.input = 'hello';
  return out;
}

function waitFor(url, attempts) {
  return new Promise((resolve, reject) => {
    const attempt = left => {
      http.get(url, res => { res.resume(); resolve(); })
        .on('error', err => {
          if (left <= 0) return reject(err);
          setTimeout(() => attempt(left - 1), 1000);
        });
    };
    attempt(attempts);
  });
}

before(async () => {
  baseUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const external = Boolean(process.env.OLLAMA_URL);

  if (!external) {
    ollama = spawn('ollama', ['serve'], { stdio: 'ignore' });
    ollama.on('error', () => { ollama = null; });
  }
  await waitFor(baseUrl + '/api/version', 30);
  if (!external) {
    execFileSync('ollama', ['pull', MODEL], { stdio: 'inherit', timeout: 600000 });
  }

  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-ollama-'));
  const app = express();
  redServer = http.createServer(app);
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
  if (RED.nodes) await RED.stop();
  if (redServer) await new Promise(resolve => redServer.close(resolve));
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  if (ollama) ollama.kill();
});

async function callThroughNodeRed(nodes) {
  const probe = nodes.find(n => n.type === 'debug');
  probe.type = 'function';
  probe.name = 'probe';
  probe.outputs = 1;
  probe.wires = [[]];
  probe.func = "global.set('ollamaResult', { status: msg.statusCode, payload: msg.payload });\n"
    + 'return msg;';
  for (const node of nodes) {
    if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
    if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
  }

  fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
  await RED.nodes.loadFlows(true);

  let node = null;
  for (let i = 0; i < 50 && !node; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    node = RED.nodes.getNode(probe.id);
  }
  assert.ok(node, 'the probe node never started');
  const context = node.context().global;
  context.set('ollamaResult', null);

  const started = Date.now();
  let result = null;
  while (!result && Date.now() - started < 120000) {
    await new Promise(resolve => setTimeout(resolve, 200));
    result = context.get('ollamaResult');
  }
  assert.ok(result, 'no response from ollama within 120s');
  return result;
}

for (const [format, load] of Object.entries(DOCS)) {
  describe(format, () => {
    let doc;

    before(() => { doc = load(); });

    test('the definition lists every ollama endpoint', () => {
      const paths = flowgen.listOperations(doc).operations.map(o => o.path).sort();
      const expected = Object.keys(VARIATIONS).concat(WRITE_PATHS).sort();
      assert.deepStrictEqual(paths, expected);
    });

    test('every endpoint generates valid code for every variation', () => {
      let generated = 0;
      for (const op of flowgen.listOperations(doc).operations) {
        const code = flowgen.generate(doc, op.method, op.path);
        assert.doesNotThrow(() => new Function(code), op.method + ' ' + op.path);
        assert.match(code, /^msg\.method = `[A-Z]+`;/);
        assert.match(code, /msg\.url = `http:\/\/127\.0\.0\.1:11434/);
        generated++;
      }
      assert.strictEqual(generated, 17);
    });

    test('every endpoint and variation reaches the ollama server', async () => {
      const results = [];
      for (const op of flowgen.listOperations(doc).operations) {
        if (WRITE_PATHS.indexOf(op.path) !== -1) continue;
        const variations = VARIATIONS[op.path] || [{}];
        for (const overrides of variations) {
          const nodes = flowgen.buildFlow(doc, op.method, op.path, { tab: false });
          const fn = nodes.find(n => n.type === 'function');
          let source = fn.func.replace(/`http:\/\/127\.0\.0\.1:11434/g, '`' + baseUrl);

          const built = new Function('msg', source).call(null, {}) || {};
          if (built.payload && typeof built.payload === 'object') {
            const merged = Object.assign(tidy(built.payload, op.path), overrides);
            if (merged.options && built.payload.options) {
              merged.options = Object.assign({}, tidy(built.payload, op.path).options,
                overrides.options || {});
            }
            source = source.replace(/msg\.payload = [\s\S]*?\n\};/,
              'msg.payload = ' + JSON.stringify(merged, null, 2) + ';');
          }
          fn.func = source;

          const result = await callThroughNodeRed(nodes);
          results.push(op.path + ' -> ' + result.status);
          assert.ok(result.status >= 200 && result.status < 300,
            op.method + ' ' + op.path + ' with ' + JSON.stringify(overrides) +
            ' returned ' + result.status + ' ' + JSON.stringify(result.payload).slice(0, 200));
        }
      }
      assert.ok(results.length >= 20, 'ran ' + results.length + ' calls');
    });

    test('the model answers a chat request', { skip: READ_ONLY }, async () => {
      const nodes = flowgen.buildFlow(doc, 'post', '/api/chat', { tab: false });
      const fn = nodes.find(n => n.type === 'function');
      fn.func = fn.func
        .replace(/`http:\/\/127\.0\.0\.1:11434/g, '`' + baseUrl)
        .replace(/msg\.payload = [\s\S]*?\n\};/, 'msg.payload = ' + JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: 'Reply with the single word ok.' }],
          stream: false,
          options: { num_predict: 8, temperature: 0, seed: 1 }
        }, null, 2) + ';');

      const result = await callThroughNodeRed(nodes);
      assert.strictEqual(result.status, 200);
      assert.ok(result.payload.message, 'no message in ' + JSON.stringify(result.payload));
      assert.strictEqual(typeof result.payload.message.content, 'string');
    });
  });
}
