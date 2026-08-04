'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');
const playwright = require('playwright');

const ENGINES = (process.env.BROWSERS || 'chromium').split(',')
  .map(name => name.trim()).filter(Boolean);

const SPEC = [
  'openapi: 3.0.3',
  'info:',
  '  title: Demo',
  '  version: 1.0.0',
  'servers:',
  '  - url: https://demo.test/api',
  'paths:',
  '  /pets:',
  '    get:',
  '      summary: List pets',
  '      responses:',
  '        "200":',
  '          description: ok',
  '  /pets/{petId}:',
  '    delete:',
  '      summary: Remove a pet',
  '      parameters:',
  '        - name: petId',
  '          in: path',
  '          required: true',
  '          schema:',
  '            type: integer',
  '      responses:',
  '        "200":',
  '          description: ok'
].join('\n');

const ONE = SPEC.split('  /pets/{petId}:')[0];

let userDir, server, port;

before(async () => {
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-browser-'));
  fs.mkdirSync(path.join(userDir, 'node_modules', 'node-red-flowgen'), { recursive: true });
  const target = path.join(userDir, 'node_modules', 'node-red-flowgen');
  for (const file of ['flowgen.js', 'flowgen-plugin.js', 'flowgen-plugin.html', 'package.json']) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(target, file));
  }
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'),
    path.join(target, 'node_modules'), 'dir');

  const app = express();
  server = http.createServer(app);
  RED.init(server, {
    httpAdminRoot: '/',
    httpNodeRoot: false,
    userDir: userDir,
    flowFile: 'flows.json',
    editorTheme: { tours: false },
    logging: { console: { level: 'fatal', metrics: false, audit: false } }
  });
  app.use('/', RED.httpAdmin);
  fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  await RED.start();
});

after(async () => {
  if (COVERAGE_DIR && collected.length) {
    const v8toIstanbul = require('v8-to-istanbul');
    const target = path.join(__dirname, '..', 'flowgen-plugin.html');
    const offset = pluginSource.indexOf(collected[0].source);
    const merged = {};
    for (const entry of collected) {
      const converter = v8toIstanbul(target, offset > 0 ? offset : 0,
        { source: entry.source });
      await converter.load();
      converter.applyCoverage(entry.functions);
      const data = converter.toIstanbul()[target];
      if (!data) continue;
      if (!merged[target]) { merged[target] = data; continue; }
      for (const key of Object.keys(data.s)) merged[target].s[key] += data.s[key];
      for (const key of Object.keys(data.f)) merged[target].f[key] += data.f[key];
      for (const key of Object.keys(data.b)) {
        data.b[key].forEach((n, i) => { merged[target].b[key][i] += n; });
      }
    }
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVERAGE_DIR, 'browser-coverage.json'),
      JSON.stringify(merged));
  }
  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
});

const COVERAGE_DIR = process.env.BROWSER_COVERAGE_DIR || '';
const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'flowgen-plugin.html'), 'utf8');
const collected = [];

async function startCoverage(page) {
  if (!COVERAGE_DIR || !page.coverage) return;
  await page.coverage.startJSCoverage();
}

async function stopCoverage(page) {
  if (!COVERAGE_DIR || !page.coverage) return;
  let entries;
  try {
    entries = await page.coverage.stopJSCoverage();
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    if (!entry.source || entry.source.indexOf('flowgen-select-btn') === -1) continue;
    collected.push({ source: entry.source, functions: entry.functions });
  }
}

async function openImport(page) {
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.RED && window.RED.actions, null, { timeout: 60000 });
  await page.evaluate(() => window.RED.actions.invoke('core:show-import-dialog'));
  await click(page, '#flowgen-tab-link');
  await page.waitForFunction(
    () => !!document.getElementById('flowgen-spec-text'), null, { timeout: 20000 });
}

async function click(page, selector) {
  await page.waitForFunction(sel => !!document.querySelector(sel), selector, { timeout: 20000 });
  await page.$eval(selector, el => el.click());
  await page.waitForTimeout(150);
}

const okDisabled = page =>
  page.$eval('#red-ui-clipboard-dialog-ok', el => el.disabled === true);

async function waitOk(page, disabled) {
  await page.waitForFunction(
    want => document.getElementById('red-ui-clipboard-dialog-ok').disabled === want,
    disabled, { timeout: 20000 });
}

async function dblclick(page, selector) {
  await page.waitForFunction(sel => !!document.querySelector(sel), selector, { timeout: 20000 });
  await page.$eval(selector, el => {
    el.click();
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(120);
}

async function paste(page, text) {
  await page.fill('#flowgen-spec-text', text);
  await page.dispatchEvent('#flowgen-spec-text', 'keyup');
  await page.waitForTimeout(700);
}

const nodeTypes = page => page.evaluate(() => {
  const out = [];
  window.RED.nodes.eachNode(n => out.push(n.type));
  return out.sort();
});

const LAUNCH = {
  chromium: () => playwright.chromium.launch(),
  firefox: () => playwright.firefox.launch(),
  webkit: () => playwright.webkit.launch(),
  msedge: () => playwright.chromium.launch({ channel: 'msedge' }),
  chrome: () => playwright.chromium.launch({ channel: 'chrome' })
};

for (const engine of ENGINES) {
  describe(engine, () => {
    let browser;

    before(async () => {
      const launcher = LAUNCH[engine];
      assert.ok(launcher, 'unknown browser: ' + engine);
      browser = await launcher();
    });

    after(async () => {
      if (browser) await browser.close();
    });

    test('the API Spec tab is added to the import dialog', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      const labels = await page.$$eval('#red-ui-clipboard-dialog-import-tabs li a',
        els => els.map(e => e.textContent.trim()));
      assert.ok(labels.includes('API Spec'), labels.join(','));
      assert.strictEqual(labels[labels.length - 1], 'API Spec');
      await stopCoverage(page);
      await page.close();
    });

    test('a single endpoint enables Import and adds the four nodes', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, ONE);

      assert.strictEqual(await page.isVisible('#flowgen-select-btn'), false);
      assert.strictEqual(await okDisabled(page), false);

      await click(page, '#red-ui-clipboard-dialog-ok');
      await page.waitForTimeout(500);
      assert.deepStrictEqual(await nodeTypes(page),
        ['debug', 'function', 'http request', 'inject']);
      await stopCoverage(page);
      await page.close();
    });

    test('several endpoints go through the select step', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, SPEC);

      assert.strictEqual(await page.isVisible('#flowgen-select-btn'), true);
      assert.strictEqual(await okDisabled(page), true);

      await click(page, '#flowgen-select-btn');
      await page.waitForSelector('#flowgen-op-list .flowgen-op');
      assert.strictEqual((await page.$$('#flowgen-op-list .flowgen-op')).length, 2);

      await click(page, '#flowgen-op-list .flowgen-op:nth-of-type(2)');
      await waitOk(page, false);
      await click(page, '#red-ui-clipboard-dialog-ok');
      await page.waitForTimeout(500);

      const code = await page.evaluate(() => {
        let src = '';
        window.RED.nodes.eachNode(n => { if (n.type === 'function') src = n.func; });
        return src;
      });
      assert.match(code, /msg\.method = `DELETE`;/);
      assert.match(code, /\{petId\}/);
      await stopCoverage(page);
      await page.close();
    });

    test('arrow keys and double click work in the endpoint list', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, SPEC);
      await click(page, '#flowgen-select-btn');
      await page.waitForSelector('#flowgen-op-list .flowgen-op');

      await page.focus('#flowgen-op-list');
      await page.keyboard.press('ArrowDown');
      assert.strictEqual(
        await page.$eval('#flowgen-op-list .flowgen-op', el => el.classList.contains('selected')),
        true);

      await dblclick(page, '#flowgen-op-list .flowgen-op:nth-of-type(1)');
      await page.waitForTimeout(500);
      assert.ok((await nodeTypes(page)).includes('http request'));
      assert.strictEqual(await page.isVisible('#red-ui-clipboard-dialog'), false,
        'the dialog closes after a double click');
      await stopCoverage(page);
      await page.close();
    });

    test('the editor never reloads while importing', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await page.evaluate(() => { window.__stayed = true; });
      await paste(page, ONE);
      await click(page, '#red-ui-clipboard-dialog-ok');
      await page.waitForTimeout(500);
      assert.strictEqual(await page.evaluate(() => window.__stayed === true), true);
      await stopCoverage(page);
      await page.close();
    });

    test('reopening the dialog starts from a clean panel', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, SPEC);
      await click(page, '#flowgen-select-btn');
      await page.waitForSelector('#flowgen-op-list .flowgen-op');
      await page.evaluate(() => $('#red-ui-clipboard-dialog').dialog('close'));
      await page.waitForTimeout(400);

      await page.evaluate(() => window.RED.actions.invoke('core:show-import-dialog'));
      await click(page, '#flowgen-tab-link');
      await page.waitForTimeout(300);

      assert.strictEqual(await page.inputValue('#flowgen-spec-text'), '');
      assert.strictEqual(await page.isVisible('#flowgen-select-btn'), false);
      assert.strictEqual(await okDisabled(page), true);
      await stopCoverage(page);
      await page.close();
    });

    test('leaving the tab hides the panel and shows the chosen one', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      const shown = () => page.$$eval('#red-ui-clipboard-dialog-import-tabs-content > div',
        els => els.filter(e => e.offsetParent !== null).map(e => e.id));

      assert.deepStrictEqual(await shown(), ['red-ui-clipboard-dialog-import-tab-apispec']);

      for (const id of ['local', 'examples', 'clipboard']) {
        await click(page, '#red-ui-tab-red-ui-clipboard-dialog-import-tab-' + id);
        await page.waitForTimeout(500);
        const visible = await shown();
        assert.ok(visible.includes('red-ui-clipboard-dialog-import-tab-' + id),
          'the chosen panel is shown: ' + visible.join(','));
        assert.ok(!visible.includes('red-ui-clipboard-dialog-import-tab-apispec'),
          'the API Spec panel must not linger: ' + visible.join(','));
      }

      await click(page, '#flowgen-tab-link');
      await page.waitForTimeout(400);
      assert.deepStrictEqual(await shown(), ['red-ui-clipboard-dialog-import-tab-apispec'],
        'returning to the tab shows only our panel');
      await stopCoverage(page);
      await page.close();
    });

    test('the Select endpoint button is red and Back is grey', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, SPEC);
      const select = await page.$eval('#flowgen-select-btn',
        el => getComputedStyle(el).backgroundColor);
      assert.strictEqual(select, 'rgb(173, 22, 37)');

      await click(page, '#flowgen-select-btn');
      const back = await page.$eval('#flowgen-back-btn',
        el => getComputedStyle(el).backgroundColor);
      assert.strictEqual(back, 'rgb(255, 255, 255)');
      await stopCoverage(page);
      await page.close();
    });

    test('the endpoint list can be searched from the keyboard', async () => {
      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, SPEC);
      await click(page, '#flowgen-select-btn');
      await page.waitForSelector('#flowgen-op-list .flowgen-op');

      const visible = () => page.$$eval('#flowgen-op-list .flowgen-op',
        els => els.filter(e => e.offsetParent !== null).length);
      assert.strictEqual(await visible(), 2);

      assert.strictEqual(await page.evaluate(
        () => document.activeElement && document.activeElement.id), 'flowgen-search',
        'the search box takes focus when the list opens');

      await page.fill('#flowgen-search', 'remove');
      await page.waitForTimeout(200);
      assert.strictEqual(await visible(), 1);
      await waitOk(page, false);

      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      const code = await page.evaluate(() => {
        let src = '';
        window.RED.nodes.eachNode(n => { if (n.type === 'function') src = n.func; });
        return src;
      });
      assert.match(code, /msg\.method = `DELETE`;/);
      await stopCoverage(page);
      await page.close();
    });

    test('a Bruno git URL is cloned by the runtime and stays in the text area', async () => {
      const { execFileSync } = require('child_process');
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'br-git-'));
      fs.writeFileSync(path.join(repo, 'get-user.yml'),
        'info:\n  name: Get user\nhttp:\n  method: GET\n  url: https://api.example.test/users/1\n');
      execFileSync('git', ['init', '-q', repo]);
      execFileSync('git', ['-C', repo, 'add', '-A']);
      execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t',
        'commit', '-qm', 'x']);
      execFileSync('git', ['-C', repo, 'update-server-info']);

      const statics = express();
      statics.use(express.static(repo, { dotfiles: 'allow' }));
      const gitServer = http.createServer(statics);
      await new Promise(resolve => gitServer.listen(0, '127.0.0.1', resolve));
      const gitUrl = 'http://127.0.0.1:' + gitServer.address().port + '/.git';

      const page = await browser.newPage();
      await startCoverage(page);
      await openImport(page);
      await paste(page, gitUrl);
      await page.waitForTimeout(3000);

      assert.strictEqual(await page.inputValue('#flowgen-spec-text'), gitUrl,
        'the pasted git URL is left untouched');
      await waitOk(page, false);

      await click(page, '#red-ui-clipboard-dialog-ok');
      await page.waitForTimeout(600);
      const code = await page.evaluate(() => {
        let src = '';
        window.RED.nodes.eachNode(n => { if (n.type === 'function') src = n.func; });
        return src;
      });
      assert.match(code, /api\.example\.test\/users\/1/);

      await new Promise(resolve => gitServer.close(resolve));
      fs.rmSync(repo, { recursive: true, force: true });
      await stopCoverage(page);
      await page.close();
    });

    test('the tab disappears when the runtime stops serving the plugin', async () => {
      const page = await browser.newPage();
      await openImport(page);
      assert.strictEqual((await page.$$('#flowgen-tab-link')).length, 1);

      await page.route('**/flowgen/editor-script/flowgen.js', route => route.fulfill({ status: 404, body: '' }));

      await page.evaluate(() => $('#red-ui-clipboard-dialog').dialog('close'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.RED.actions.invoke('core:show-import-dialog'));
      await page.waitForTimeout(1200);

      assert.strictEqual((await page.$$('#flowgen-tab-link')).length, 0,
        'the API Spec tab must be gone');
      assert.strictEqual((await page.$$('#red-ui-clipboard-dialog-import-tab-apispec')).length, 0);

      const labels = await page.$$eval('#red-ui-clipboard-dialog-import-tabs li a',
        els => els.map(e => e.textContent.trim()));
      assert.ok(!labels.includes('API Spec'), labels.join(','));

      const shown = await page.$$eval('#red-ui-clipboard-dialog-import-tabs-content > div',
        els => els.filter(e => e.offsetParent !== null).map(e => e.id));
      assert.ok(shown.length >= 1, 'another tab is visible');
      await page.close();
    });

    test('a spec URL is fetched through the runtime, not the browser', async () => {
      const page = await browser.newPage();
      const direct = [];
      await page.route('**/*', route => {
        const url = route.request().url();
        if (!url.includes('127.0.0.1:' + port)) direct.push(url);
        route.continue();
      });

      const upstream = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/yaml' });
        res.end(ONE);
      });
      await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
      const specUrl = 'http://127.0.0.1:' + upstream.address().port + '/spec.yaml';

      await openImport(page);
      await paste(page, specUrl);
      await page.waitForTimeout(800);

      assert.strictEqual(await okDisabled(page), false);
      assert.match(await page.inputValue('#flowgen-spec-text'), /openapi: 3\.0\.3/);
      assert.deepStrictEqual(direct.filter(u => u.includes('/spec.yaml')), [],
        'the browser must not request the spec itself');

      await new Promise(resolve => upstream.close(resolve));
      await stopCoverage(page);
      await page.close();
    });
  });
}
