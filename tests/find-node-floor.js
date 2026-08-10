'use strict';

// Finds the lowest Node.js release that can run the newest Node-RED with this
// plugin installed AND serve a flow editor that opens without error.
//
//   node tests/find-node-floor.js
//   BROWSERS=chromium,firefox,webkit node tests/find-node-floor.js
//
// The editor is the thing that matters: a runtime where Node-RED boots but the
// editor throws is not a supported runtime. Each candidate Node is installed
// from npm into a throwaway directory, so nothing here touches the repository's
// own node_modules.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');

// Small but complete: enough to prove the parser, the generator and the list
// rendering all work on the runtime under test.
const SPEC = [
    'openapi: 3.0.3',
    'info:', '  title: floor probe', '  version: "1"',
    'servers:', '  - url: https://api.test',
    'paths:',
    '  /x:', '    get:', '      responses:',
    '        "200": { description: ok }'
].join('\n');
const WINDOWS = process.platform === 'win32';
const NPM = WINDOWS ? 'npm.cmd' : 'npm';
const ENGINES = (process.env.BROWSERS || 'chromium,firefox,webkit').split(',')
    .map(name => name.trim()).filter(Boolean);

function run(cmd, args, options) {
    return new Promise(resolve => {
        execFile(cmd, args, Object.assign({
            encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, shell: WINDOWS
        }, options), (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: stdout, stderr: stderr });
        });
    });
}

function candidates() {
    const all = JSON.parse(execFileSync(NPM, ['view', 'node', 'versions', '--json'], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: WINDOWS
    }));
    // Node-RED 5 declares >=22.9. Anything below that is unsupported upstream,
    // so it is not a floor worth claiming even if it happens to run.
    return all.filter(version => {
        const [major, minor] = version.split('.').map(Number);
        if (!Number.isFinite(major) || major < 22) return false;
        if (major === 22 && minor < 9) return false;
        return !/-/.test(version);
    });
}

// Runs inside the candidate installation, under the candidate node. It boots
// Node-RED with the plugin, drives a real browser at the editor, and reports
// through the exit code.
// Node-RED runs under the candidate node; the browser is driven from the
// process running this script, whose playwright install is already set up.
// Mixing the two would force playwright onto old runtimes it does not support.
const PROBE = `
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');

(async () => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-floor-'));
    const app = express();
    const server = http.createServer(app);
    RED.init(server, {
        httpAdminRoot: '/',
        httpNodeRoot: false,
        userDir: userDir,
        flowFile: 'flows.json',
        editorTheme: { tours: false },
        // Exercise the logger rather than silencing it: a runtime whose logging
        // is broken looks healthy until something goes wrong.
        logging: { console: { level: 'info', metrics: false, audit: false } }
    });
    app.use('/', RED.httpAdmin);
    fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await RED.start();
    const port = server.address().port;

    RED.log.info('node floor probe: logging works');
    RED.log.error('node floor probe: error path works');

    process.stdout.write('READY ' + port + '\\n');
    // Hold the editor up until the driver has finished with it.
    await new Promise(resolve => process.stdin.on('data', resolve));

    await RED.stop();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(userDir, { recursive: true, force: true });
    process.exit(0);
})().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\\n');
    process.exit(3);
});
`;

function fault(text) {
    const lines = String(text || '').split('\n')
        .map(line => line.trim())
        .filter(line => line && !/^at /.test(line));
    return lines.slice(0, 2).join(' | ') || 'no output';
}

async function works(version) {
    const playwright = require('playwright');
    const { spawn } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-floor-'));
    let child = null;
    try {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
            name: 'node-floor-probe', version: '1.0.0', private: true
        }));

        const install = await run(NPM, ['install', 'node@' + version, 'node-red', 'express',
            '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
        if (!install.ok) { return { ok: false, why: 'install: ' + fault(install.stderr) }; }

        const nodeBin = path.join(dir, 'node_modules', '.bin', WINDOWS ? 'node.cmd' : 'node');
        if (!fs.existsSync(nodeBin)) { return { ok: false, why: 'no node binary' }; }

        const pkgDir = path.join(dir, 'node_modules', 'node-red-flowgen');
        fs.mkdirSync(pkgDir, { recursive: true });
        for (const file of ['flowgen.js', 'flowgen-plugin.js', 'flowgen-plugin.html']) {
            fs.copyFileSync(path.join(REPO, file), path.join(pkgDir, file));
        }
        fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
            name: 'node-red-flowgen', version: '0.0.0',
            'node-red': { plugins: { flowgen: 'flowgen-plugin.js' } },
            dependencies: { 'js-yaml': '*' }
        }, null, 2));
        fs.cpSync(path.join(REPO, 'node_modules', 'js-yaml'),
            path.join(dir, 'node_modules', 'js-yaml'), { recursive: true });

        const probe = path.join(dir, 'probe.js');
        fs.writeFileSync(probe, PROBE);

        const port = await new Promise((resolve, reject) => {
            child = spawn(nodeBin, [probe], { cwd: dir });
            let out = '';
            let err = '';
            const timer = setTimeout(() => reject(new Error('never became ready: ' +
                fault(err))), 120000);
            child.stdout.on('data', chunk => {
                out += chunk;
                const ready = out.match(/READY (\d+)/);
                if (ready) { clearTimeout(timer); resolve(Number(ready[1])); }
            });
            child.stderr.on('data', chunk => { err += chunk; });
            child.on('exit', () => {
                clearTimeout(timer);
                reject(new Error(fault(err) || 'exited before becoming ready'));
            });
        });

        const failures = [];
        for (const engine of ENGINES) {
            const launcher = playwright[engine];
            if (!launcher) { failures.push(engine + ': unknown engine'); continue; }
            let browser = null;
            try {
                browser = await launcher.launch();
                const page = await browser.newPage();
                const errors = [];
                page.on('pageerror', pageError => errors.push(String(pageError.message)));

                await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
                await page.waitForFunction(() => window.RED && window.RED.actions,
                    null, { timeout: 60000 });
                await page.evaluate(() => window.RED.actions.invoke('core:show-import-dialog'));
                await page.waitForTimeout(2500);

                // Opening the tab is not enough: drive an actual import, which
                // exercises flowgen.js in the browser and the plugin's routes.
                const tab = await page.$$('#flowgen-tab-link');
                if (tab.length) {
                    await page.$eval('#flowgen-tab-link', el => el.click());
                    await page.waitForFunction(
                        () => !!document.getElementById('flowgen-spec-text'),
                        null, { timeout: 20000 });
                    await page.fill('#flowgen-spec-text', SPEC);
                    await page.dispatchEvent('#flowgen-spec-text', 'keyup');
                    await page.waitForTimeout(2500);
                    const listed = await page.$$eval('#flowgen-op-list .flowgen-op',
                        els => els.length);
                    if (!listed) { failures.push(engine + ': the spec produced no endpoints'); }
                }
                const alive = await page.evaluate(() => {
                    try {
                        window.RED.nodes.eachNode(function () {});
                        return !!(window.RED.view && window.RED.nodes && window.RED.actions);
                    } catch (err) { return false; }
                });

                if (errors.length) { failures.push(engine + ': page error: ' + errors[0]); }
                else if (!alive) { failures.push(engine + ': the editor lost part of itself'); }
                else if (!tab.length) { failures.push(engine + ': no API Spec tab'); }
            } catch (err) {
                failures.push(engine + ': ' + String((err && err.message) || err).split('\n')[0]);
            } finally {
                if (browser) { await browser.close(); }
            }
        }

        return failures.length
            ? { ok: false, why: failures.join(' | ') }
            : { ok: true, detail: 'editor ok in ' + ENGINES.join(', ') };
    } catch (err) {
        return { ok: false, why: String((err && err.message) || err) };
    } finally {
        if (child) { child.kill(); }
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function main() {
    const versions = candidates();
    const redVersion = execFileSync(NPM, ['view', 'node-red', 'version'], {
        encoding: 'utf8', shell: WINDOWS
    }).trim();
    process.stdout.write('node-red ' + redVersion + ', browsers ' + ENGINES.join(', ') +
        ', searching ' + versions.length + ' node releases from ' + versions[0] +
        ' to ' + versions[versions.length - 1] + '\n\n');

    const seen = new Map();
    const check = async version => {
        if (seen.has(version)) return seen.get(version);
        const outcome = await works(version);
        seen.set(version, outcome);
        process.stdout.write((outcome.ok ? '  works   ' : '  fails   ') + version +
            (outcome.ok ? '' : '  (' + outcome.why + ')') + '\n');
        return outcome;
    };

    if (!(await check(versions[versions.length - 1])).ok) {
        process.stdout.write('\nthe newest node in range does not work\n');
        process.exit(1);
    }

    let low = 0;
    let high = versions.length - 1;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((await check(versions[mid])).ok) high = mid;
        else low = mid + 1;
    }

    process.stdout.write('\nlowest working node: ' + versions[low] + '\n');
    process.stdout.write('suggested engines field: "node": ">=' + versions[low] + '"\n');
}

if (require.main === module) {
    main().catch(err => {
        process.stderr.write(String((err && err.stack) || err) + '\n');
        process.exit(1);
    });
}

module.exports = { works, candidates };
