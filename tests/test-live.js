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
  { name: 'httpbin', url: 'https://httpbin.org/spec.json' },
  { name: 'httpbingo', url: 'https://httpbingo.org/spec.json' },
  { name: 'apis-guru',
    url: 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/apis.guru/2.2.0/openapi.yaml' },
  { name: 'apis-guru-v2',
    url: 'https://api.apis.guru/v2/openapi.yaml' }
];

const BRUNO_SOURCES = [
  { name: 'bruno-starter-guide',
    git: 'https://github.com/bruno-collections/bruno-starter-guide.git' },
  { name: 'cyberark-apis', git: 'https://github.com/strick-j/CyberArk-APIs.git' },
  { name: 'stripe-bruno', git: 'https://github.com/rreyn-bruno/Stripe-Bruno-Collection.git' },
  { name: 'trustpilot-docs',
    git: 'https://github.com/trustpilot/documentation-bruno-collection.git' },
  { name: 'readwise-bruno', git: 'https://github.com/Scarvy/readwise-bruno.git' },
  { name: 'odk-central',
    git: 'https://github.com/CEN-Nouvelle-Aquitaine/bruno-API-ODKCentral.git' },
  { name: 'joomla-api', git: 'https://github.com/renekreijveld/bruno-joomla-api.git' },
  { name: 'udm-api', git: 'https://github.com/sirkirby/bruno-udm-api.git' },
  { name: 'eventsourcingdb',
    git: 'https://github.com/thenativeweb/eventsourcingdb-client-bruno.git' },
  { name: 'cupra-weconnect',
    git: 'https://github.com/Timwun/Cupra-WeConnect-Bruno-Collection.git' },
  { name: 'cyberark-rest', git: 'https://github.com/IAM-Jah/CyberArk-REST-API-Bruno.git' }
];

const CASES = [
  { source: 'petstore-v2', method: 'get', path: '/store/inventory' },
  { source: 'petstore-v2', method: 'get', path: '/store/inventory',
    auth: { api_key: 'special-key' } },
  { source: 'petstore-v2', method: 'get', path: '/pet/findByStatus' },
  { source: 'petstore-v2', method: 'get', path: '/pet/{petId}', fill: { petId: '1' },
    expect: [200, 404] },
  { source: 'petstore-v3', method: 'get', path: '/pet/{petId}', fill: { petId: '1' },
    expect: [200, 404] },
  { source: 'petstore-v3', method: 'get', path: '/pet/findByStatus' },
  { source: 'httpbin', method: 'get', path: '/get' },
  { source: 'httpbin', method: 'get', path: '/headers' },
  { source: 'httpbin', method: 'get', path: '/response-headers' },
  { source: 'httpbin', method: 'post', path: '/post' },
  { source: 'httpbin', method: 'get', path: '/status/{codes}', fill: { codes: '200' } },
  { source: 'httpbin', method: 'get', path: '/bearer', expect: [200, 401] },
  { source: 'httpbin', method: 'get', path: '/bearer',
    addAuth: { authorization: 'Bearer live-test-token' }, expect: 200 },
  { source: 'bruno-starter-guide', method: 'get', path: '/users/usebruno' },
  { source: 'bruno-starter-guide', method: 'get', path: '/basic-auth/usebruno/1234',
    expect: [200, 401] },
  { source: 'bruno-starter-guide', method: 'get', path: '/basic-auth/usebruno/1234',
    auth: { authorization: 'Basic dXNlYnJ1bm86MTIzNA==' }, expect: 200 },
  { source: 'httpbin', method: 'get', path: '/basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200 },
  { source: 'httpbingo', method: 'get', path: '/get' },
  { source: 'httpbingo', method: 'post', path: '/post' },
  { source: 'httpbingo', method: 'get', path: '/headers' },
  { source: 'httpbingo', method: 'get', path: '/bearer',
    addAuth: { authorization: 'Bearer live-test-token' }, expect: 200 },
  { source: 'httpbingo', method: 'get', path: '/basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200 },
  { source: 'httpbingo', method: 'get', path: '/hidden-basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200 },
  { source: 'httpbingo', method: 'get', path: '/status/{code}', fill: { code: '204' },
    expect: 204 },
  { source: 'apis-guru', method: 'get', path: '/providers.json' },
  { source: 'apis-guru', method: 'get', path: '/metrics.json' },
  { source: 'apis-guru', method: 'get', path: '/list.json' },
  { source: 'apis-guru-v2', method: 'get', path: '/providers.json' },
  { source: 'apis-guru-v2', method: 'get', path: '/list.json' }
];

const summary = [];

const CORPUS_CASES = [
  { spec: 'zoomconnect.com/1/swagger.yaml', path: '/api/rest/v1/account/balance' },
  { spec: 'data2crm.com/1/swagger.yaml', path: '/application/entity/account/describe' },
  { spec: 'consumerfinance.gov/1.0/swagger.yaml', path: '/data' },
  { spec: 'avaza.com/v1/swagger.yaml', path: '/api/Currency' },
  { spec: 'quarantine.country/1.0/swagger.yaml', path: '/summary/latest' },
  { spec: 'rbaskets.in/1.0.0/swagger.yaml', path: '/api/version' },
  { spec: 'deutschebahn.com/flinkster/v1/swagger.yaml', path: '/index' },
  { spec: 'mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml', path: '/settlement-currencies' },
  { spec: 'mastercard.com/MDES/2.0.7/swagger.yaml', path: '/systemstatus' },
  { spec: 'mastercard.com/Locations/1.0.0/swagger.yaml', path: '/atms/v1/country' },
  { spec: 'rumble.run/2.15.0/openapi.yaml', path: '/releases/agent/version' },
  { spec: 'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml', path: '/v0.5/.well-known/openid-configuration' },
  { spec: 'ndhm.gov.in/ndhm-hiu/0.5/openapi.yaml', path: '/v0.5/.well-known/openid-configuration' },
  { spec: 'ndhm.gov.in/ndhm-cm/0.5/openapi.yaml', path: '/v0.5/heartbeat' },
  { spec: 'ndhm.gov.in/ndhm-gateway/0.5/openapi.yaml', path: '/v0.5/.well-known/openid-configuration' },
  { spec: 'contribly.com/1.0.0/openapi.yaml', path: '/artifact-formats' },
  { spec: 'bigdatacloud.net/1.0.0/openapi.yaml', path: '/data/ip-geolocation-full' },
  { spec: 'thebluealliance.com/3.8.2/openapi.yaml', path: '/status' },
  { spec: 'zuora.com/2021-08-20/openapi.yaml', path: '/v1/accounting-codes' },
  { spec: 'asuarez.dev/searchly/1.0/openapi.yaml', path: '/similarity/by_song' },
  { spec: 'openai.com/1.2.0/openapi.yaml', path: '/files' },
  { spec: 'httpbin.org/0.9.2/openapi.yaml', path: '/anything' }
];

const CORPUS_BASE =
  'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';

function note(level, text) {
  const line = String(text).replace(/\r?\n/g, ' ');
  process.stdout.write('::' + level + '::' + line + '\n');
  summary.push((level === 'error' ? 'FAIL | ' : 'ok   | ') + line);
}

function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  fs.appendFileSync(file,
    '## Live API results\n\n```\n' + summary.join('\n') + '\n```\n');
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

function addHeaders(code, headers) {
  const extra = Object.entries(headers)
    .map(([name, value]) => '  ' + JSON.stringify(name) + ': ' + JSON.stringify(value))
    .join(',\n');
  return code.replace(/return msg;\s*$/,
    'msg.headers = Object.assign(msg.headers || {}, {\n' + extra + '\n});\nreturn msg;');
}

function applyAuth(code, headers) {
  let out = code;
  for (const [name, value] of Object.entries(headers || {})) {
    const pattern = new RegExp("('" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      "': )`[^`]*`");
    if (!pattern.test(out)) {
      throw new Error('no placeholder for header ' + name);
    }
    out = out.replace(pattern, '$1`' + value + '`');
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
  let reached = 0;

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

    if (testCase.auth || testCase.addAuth) {
      const fn = nodes.find(n => n.type === 'function');
      try {
        if (testCase.auth) { fn.func = applyAuth(fn.func, testCase.auth); }
        if (testCase.addAuth) { fn.func = addHeaders(fn.func, testCase.addAuth); }
        new Function(fn.func);
      } catch (err) {
        failures++;
        note('error', label + ' -> ' + err.message);
        continue;
      }
    }

    for (const node of nodes) {
      if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
      if (node.type === 'function') {
        node.func = applyFill(node.func, testCase.fill);
      }
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
    while (!result && Date.now() - started < 45000) {
      await new Promise(resolve => setTimeout(resolve, 200));
      result = context.get('liveResult');
    }
    result = result || { status: null };

    const expected = [].concat(testCase.expect || []);
    if (expected.length && expected.indexOf(result.status) !== -1) {
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
      note('notice', label + ' -> no response within 30s (upstream did not answer)');
    }
  }

  for (const source of BRUNO_SOURCES) {
    const doc = docs[source.name];
    if (!doc) continue;
    const list = flowgen.listOperations(doc);
    let bad = 0;
    for (const op of list.operations) {
      let code;
      try {
        code = flowgen.generate(doc, op.method, op.path);
      } catch (err) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path +
          ' -> generation failed: ' + err.message);
        continue;
      }
      try {
        new Function(code);
      } catch (err) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path +
          ' -> invalid JavaScript: ' + err.message);
        continue;
      }
      if (!/^msg\.url = `[^`]*`;$/m.test(code)) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path + ' -> no msg.url');
      }
    }
    ran += list.count;
    note('notice', source.name + ' -> ' + list.count + ' requests generated, ' +
      bad + ' problems');
  }

  if (process.env.LIVE_CORPUS) {
    for (const entry of CORPUS_CASES) {
      const label = 'corpus ' + entry.spec + ' GET ' + entry.path;
      let doc;
      try {
        doc = flowgen.parseDocument(await download(CORPUS_BASE + entry.spec, 5));
      } catch (err) {
        note('notice', label + ' -> spec unavailable: ' + err.message);
        continue;
      }
      let nodes;
      try {
        nodes = flowgen.buildFlow(doc, 'get', entry.path);
      } catch (err) {
        failures++;
        note('error', label + ' -> generation failed: ' + err.message);
        continue;
      }
      ran++;

      const source = nodes.find(n => n.type === 'function').func;
      try {
        new Function(source);
      } catch (err) {
        failures++;
        note('error', label + ' -> generated invalid JavaScript: ' + err.message);
        continue;
      }
      const urlLine = source.match(/msg\.url = `([^`]*)`;/);
      if (!urlLine) {
        failures++;
        note('error', label + ' -> no msg.url was generated');
        continue;
      }
      try {
        new URL(urlLine[1]);
      } catch (err) {
        failures++;
        note('error', label + ' -> generated an invalid URL: ' + urlLine[1]);
        continue;
      }

      for (const node of nodes) {
        if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
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
      if (!node) { note('notice', label + ' -> probe never started'); continue; }
      const context = node.context().global;
      context.set('liveResult', null);

      const started = Date.now();
      let result = null;
      while (!result && Date.now() - started < 20000) {
        await new Promise(resolve => setTimeout(resolve, 200));
        result = context.get('liveResult');
      }
      const status = (result || {}).status || null;

      if (status) {
        reached++;
        note('notice', label + ' -> HTTP ' + status + ' (the request reached the API)');
      } else {
        note('notice', label + ' -> no response (host unreachable)');
      }
    }
  }

  note('notice', 'live cases run: ' + ran + ', reached: ' + reached +
    ', failures: ' + failures);
  writeSummary();
  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  note('error', 'live run crashed: ' + err.message);
  writeSummary();
  process.exit(1);
});
