'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');
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
    for (const file of ['flowgen.js', 'flowgen-plugin.js',
        'flowgen-plugin.html', 'package.json']) {
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
    await RED.stop();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(userDir, { recursive: true, force: true });
});

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

        test('the editor measures nodes at the width flowgen predicts', async () => {
            const page = await browser.newPage();
            await openImport(page);
            await paste(page, ONE);
            await page.waitForTimeout(800);
            await click(page, '#red-ui-clipboard-dialog-ok');
            await page.waitForTimeout(1500);

            const measured = await page.evaluate(() => {
                const out = [];
                window.RED.nodes.eachNode(n => {
                    if (typeof n.w === 'number') {
                        out.push({ type: n.type, name: n.name || '', w: n.w });
                    }
                });
                return out;
            });
            assert.ok(measured.length >= 4,
                'the editor must have measured the imported nodes');

            const LABEL = {
                inject: ['timestamp', false],
                'http request': ['http request', true],
                debug: ['msg.payload', true]
            };
            const wrong = measured.filter(n => {
                const entry = LABEL[n.type] || [n.name, true];
                return flowgen.nodeWidth(entry[0], entry[1]) !== n.w;
            }).map(n => n.type + ' ' + n.name + ' editor=' + n.w +
                ' flowgen=' + flowgen.nodeWidth(
                    (LABEL[n.type] || [n.name, true])[0],
                    (LABEL[n.type] || [n.name, true])[1]));

            assert.deepStrictEqual(wrong, [],
                'nodeWidth must match the editor, or the grid maths is built on sand');

            await page.close();
        });

        test('the editor reports no warnings for an imported flow', async () => {
            const page = await browser.newPage();
            const problems = [];
            page.on('console', m => {
                if (m.type() === 'warning' || m.type() === 'error') { problems.push(m.text()); }
            });

            await openImport(page);
            await paste(page, ONE);
            await page.waitForTimeout(800);
            await click(page, '#red-ui-clipboard-dialog-ok');
            await page.waitForTimeout(1500);

            const notified = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.red-ui-notification'))
                    .map(el => el.textContent.trim()).filter(Boolean));

            assert.deepStrictEqual(notified.filter(t => /warn|invalid|error/i.test(t)), [],
                'the editor raised a notification about the imported flow');
            assert.deepStrictEqual(problems.filter(t => /grid|align|width/i.test(t)), [],
                'the editor logged a grid or width complaint');

            await page.close();
        });

        test('the API Spec tab is added to the import dialog', async () => {
            const page = await browser.newPage();
            await openImport(page);
            const labels = await page.$$eval('#red-ui-clipboard-dialog-import-tabs li a',
                els => els.map(e => e.textContent.trim()));
            assert.ok(labels.includes('API Spec'), labels.join(','));
            assert.strictEqual(labels[labels.length - 1], 'API Spec');
            await page.close();
        });

        test('a single endpoint enables Import and adds the four nodes', async () => {
            const page = await browser.newPage();
            await openImport(page);
            await paste(page, ONE);

            assert.strictEqual(await page.isVisible('#flowgen-select-btn'), false);
            assert.strictEqual(await okDisabled(page), false);

            await click(page, '#red-ui-clipboard-dialog-ok');
            await page.waitForTimeout(500);
            assert.deepStrictEqual(await nodeTypes(page),
                ['debug', 'function', 'http request', 'inject']);
            await page.close();
        });

        test('several endpoints go through the select step', async () => {
            const page = await browser.newPage();
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
            assert.match(code, /msg\.method = "DELETE";/);
            assert.match(code, /\{petId\}/);
            await page.close();
        });

        test('arrow keys and double click work in the endpoint list', async () => {
            const page = await browser.newPage();
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
            await page.close();
        });

        test('the editor never reloads while importing', async () => {
            const page = await browser.newPage();
            await openImport(page);
            await page.evaluate(() => { window.__stayed = true; });
            await paste(page, ONE);
            await click(page, '#red-ui-clipboard-dialog-ok');
            await page.waitForTimeout(500);
            assert.strictEqual(await page.evaluate(() => window.__stayed === true), true);
            await page.close();
        });

        test('reopening the dialog starts from a clean panel', async () => {
            const page = await browser.newPage();
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
            await page.close();
        });

        test('leaving the tab hides the panel and shows the chosen one', async () => {
            const page = await browser.newPage();
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
            await page.close();
        });

        test('the Select endpoint button is red and Back is grey', async () => {
            const page = await browser.newPage();
            await openImport(page);
            await paste(page, SPEC);
            const select = await page.$eval('#flowgen-select-btn',
                el => getComputedStyle(el).backgroundColor);
            assert.strictEqual(select, 'rgb(173, 22, 37)');

            await click(page, '#flowgen-select-btn');
            const back = await page.$eval('#flowgen-back-btn',
                el => getComputedStyle(el).backgroundColor);
            assert.strictEqual(back, 'rgb(255, 255, 255)');
            await page.close();
        });

        test('the endpoint list can be searched from the keyboard', async () => {
            const page = await browser.newPage();
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
            assert.match(code, /msg\.method = "DELETE";/);
            await page.close();
        });

        test('Back clears the selection so nothing can be imported blind', async () => {
            const page = await browser.newPage();
            await openImport(page);
            await paste(page, SPEC);
            await click(page, '#flowgen-select-btn');
            await page.waitForSelector('#flowgen-op-list .flowgen-op');

            await click(page, '#flowgen-op-list .flowgen-op:nth-of-type(1)');
            await waitOk(page, false);

            await click(page, '#flowgen-back-btn');
            await waitOk(page, true);
            assert.strictEqual(
                (await page.$$('#flowgen-op-list .flowgen-op.selected')).length, 0,
                'the selection must be dropped when going back');
            await page.close();
        });

        test('an invalid JSON warning from the Clipboard tab does not linger', async () => {
            const page = await browser.newPage();
            await openImport(page);

            await click(page, '#red-ui-tab-red-ui-clipboard-dialog-import-tab-clipboard');
            await page.fill('#red-ui-clipboard-dialog-import-text', 'https://petstore.swagger.io');
            await page.waitForTimeout(300);
            await click(page, '#red-ui-clipboard-dialog-ok');
            await page.waitForTimeout(600);

            const warned = await page.evaluate(() =>
                document.querySelectorAll('.red-ui-popover').length);

            await click(page, '#flowgen-tab-link');
            await page.waitForTimeout(500);

            const left = await page.evaluate(() => Array.from(
                document.querySelectorAll('.red-ui-popover'))
                .filter(el => el.offsetParent !== null).length);
            assert.strictEqual(left, 0,
                'the warning must be gone on the API Spec tab (it showed ' + warned + ')');
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
            await page.close();
        });

        // The editor is the thing that must not break. A plugin that takes the
        // editor down stops all flow development, which is far worse than the
        // plugin simply being unavailable. These cases serve a generator that
        // is broken rather than missing, and assert the editor survives.
        for (const [label, body] of [
            ['a syntax error', 'this is (not valid javascript ===='],
            ['code that throws on load', 'throw new Error("boom");'],
            ['an empty file', ''],
            ['html served as script', '<!DOCTYPE html><html><body>oops</body></html>']
        ]) {
            test('the editor survives ' + label + ' from the generator', async () => {
                const page = await browser.newPage();
                const pageErrors = [];
                page.on('pageerror', err => pageErrors.push(String(err.message)));

                await page.route('**/flowgen/generator.js', route => route.fulfill({
                    status: 200, contentType: 'application/javascript', body: body
                }));

                await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
                await page.waitForFunction(() => window.RED && window.RED.actions,
                    null, { timeout: 60000 });
                await page.evaluate(() => window.RED.actions.invoke('core:show-import-dialog'));
                await page.waitForTimeout(1500);

                // Everything the editor needs to keep working.
                const alive = await page.evaluate(() => {
                    try {
                        window.RED.actions.invoke('core:show-import-dialog');
                        window.RED.nodes.eachNode(() => {});
                        return {
                            ok: true,
                            actions: typeof window.RED.actions.invoke === 'function',
                            view: !!window.RED.view,
                            nodes: !!window.RED.nodes
                        };
                    } catch (err) {
                        return { ok: false, error: String(err.message) };
                    }
                });

                assert.ok(alive.ok, 'the editor threw: ' + alive.error);
                assert.ok(alive.actions && alive.view && alive.nodes,
                    'the editor lost part of itself: ' + JSON.stringify(alive));
                assert.deepStrictEqual(pageErrors, [],
                    'a broken plugin asset must not raise errors in the editor');

                await page.close();
            });
        }

        test('the tab disappears when the runtime stops serving the plugin', async () => {
            const page = await browser.newPage();
            await openImport(page);
            assert.strictEqual((await page.$$('#flowgen-tab-link')).length, 1);

            await page.route('**/flowgen/generator.js', route => route.fulfill({ status: 404, body: '' }));

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
            await page.close();
        });
    });
}
