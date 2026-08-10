'use strict';

// Finds the lowest Node-RED release in a range that still starts, loads the
// flowgen plugin and serves its editor resource, on whichever node runs this
// script. The answer goes into the node-red.version field of package.json.
//
//   node tests/find-node-red-floor.js            # search 3.0.0 .. 4.x
//   NODE_BIN=/path/to/node node tests/find-node-red-floor.js
//
// Each candidate is installed into a throwaway directory, so the repository's
// own node_modules is never disturbed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

const REPO = path.join(__dirname, '..');
const NODE_BIN = process.env.NODE_BIN || process.execPath;
const WINDOWS = process.platform === 'win32';
const NPM = WINDOWS ? 'npm.cmd' : 'npm';

function npmJson(args) {
    return JSON.parse(execFileSync(NPM, args, {
        encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: WINDOWS
    }));
}

function candidates() {
    const all = npmJson(['view', 'node-red', 'versions', '--json']);
    return all.filter(v => /^[345]\./.test(v) && !/-(beta|rc|alpha)/.test(v));
}

// The probe runs inside the candidate's own installation, under NODE_BIN, and
// reports through its exit code: 0 means the plugin came up.
const PROBE = `
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const RED = require('node-red');

const userDir = process.argv[2];
const app = express();
const server = http.createServer(app);

(async () => {
    RED.init(server, {
        httpAdminRoot: '/',
        httpNodeRoot: false,
        userDir: userDir,
        flowFile: 'flows.json',
        editorTheme: { tours: false },
        // The logger must be exercised, not silenced. Node-RED 3.0.0 logs
        // through util.log, which Node removed in 22, so a run that never
        // writes a log line looks healthy while being fatally broken the
        // moment anything goes wrong.
        logging: { console: { level: 'info', metrics: false, audit: false } }
    });
    app.use('/', RED.httpAdmin);
    fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    await RED.start();

    const port = server.address().port;
    const body = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: port, path: '/plugins' }, res => {
            let text = '';
            res.on('data', c => { text += c; });
            res.on('end', () => resolve(text));
        }).on('error', reject);
    });

    await RED.stop();
    await new Promise(r => server.close(r));

    process.stdout.write('probe:node=' + process.version +
        ' red=' + require('node-red/package.json').version + '\\n');
    if (!/node-red-flowgen/.test(body)) {
        process.stderr.write('the plugin never registered\\n');
        process.exit(2);
    }

    // Drive the logger on purpose. A release whose logging is broken on this
    // runtime will throw here rather than in production.
    RED.log.info('flowgen floor probe: logging works');
    RED.log.warn('flowgen floor probe: warning path works');
    RED.log.error('flowgen floor probe: error path works');

    process.exit(0);
})().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\\n');
    process.exit(3);
});
`;

// The interesting line is the error itself, not the stack frames under it.
function firstFault(text) {
    const lines = String(text || '').split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^at /.test(l));
    return lines.slice(0, 3).join(' | ') || 'no output';
}

function run(cmd, args, options) {
    return new Promise(resolve => {
        execFile(cmd, args, Object.assign({
            encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024, shell: WINDOWS
        }, options), (err, stdout, stderr) => {
            resolve({ ok: !err, code: err ? err.code : 0, stdout: stdout, stderr: stderr });
        });
    });
}

async function works(version) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-floor-'));
    try {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
            name: 'nr-floor-probe', version: '1.0.0', private: true
        }));
        const install = await run(NPM, ['install', 'node-red@' + version, 'express',
            '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
        if (!install.ok) {
            return { ok: false, why: 'install failed: ' +
                (install.stderr || '').trim().split('\n').slice(-2).join(' ') };
        }

        // The plugin is copied in the way Node-RED expects to find one.
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
        const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-floor-user-'));
        const result = await run(NODE_BIN, [probe, userDir], { cwd: dir });
        fs.rmSync(userDir, { recursive: true, force: true });

        return result.ok
            ? { ok: true, detail: (result.stdout || '').trim() }
            : { ok: false, why: firstFault(result.stderr) };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function main() {
    const nodeVersion = (await run(NODE_BIN, ['--version'])).stdout.trim();
    const versions = candidates();
    process.stdout.write('node ' + nodeVersion + ', searching ' + versions.length +
        ' Node-RED releases from ' + versions[0] + ' to ' + versions[versions.length - 1] +
        '\n\n');

    const seen = new Map();
    const check = async version => {
        if (seen.has(version)) return seen.get(version);
        const outcome = await works(version);
        seen.set(version, outcome);
        process.stdout.write((outcome.ok ? '  works   ' : '  fails   ') + version +
            (outcome.ok ? '' : '  (' + outcome.why + ')') + '\n');
        return outcome;
    };

    // The property being searched for is monotonic in practice: once a release
    // supports the runtime, later ones do too. Confirm the top of the range
    // first, since a failure there means there is nothing to find.
    const highest = versions[versions.length - 1];
    if (!(await check(highest)).ok) {
        process.stdout.write('\nno release in the range works on ' + nodeVersion + '\n');
        process.exit(1);
    }

    let low = 0;
    let high = versions.length - 1;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((await check(versions[mid])).ok) high = mid;
        else low = mid + 1;
    }

    const floor = versions[low];
    process.stdout.write('\nlowest working Node-RED on ' + nodeVersion + ': ' + floor + '\n');
    process.stdout.write('suggested package.json field: "version": ">=' + floor + '"\n');
    return floor;
}

module.exports = { works, candidates };

if (require.main === module) {
    main().catch(err => {
        process.stderr.write(String((err && err.stack) || err) + '\n');
        process.exit(1);
    });
}
