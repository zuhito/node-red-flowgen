module.exports = function (RED) {
    const fs = require('fs');
    const path = require('path');

    function browserYaml() {
        const root = path.dirname(require.resolve('js-yaml/package.json'));
        const candidates = [
            ['dist', 'browser', 'js-yaml.umd.min.js'],
            ['dist', 'js-yaml.min.js'],
            ['dist', 'js-yaml.js']
        ];
        for (const parts of candidates) {
            const file = path.join.apply(path, [root].concat(parts));
            if (fs.existsSync(file)) { return file; }
        }
        throw new Error('no browser build of js-yaml found');
    }

    const assets = {
        'generator.js': path.join(__dirname, 'flowgen.js'),
        'yaml-parser.js': browserYaml()
    };

    const needsPermission = RED.auth && RED.auth.needsPermission
        ? RED.auth.needsPermission('flows.write')
        : function (req, res, next) { next(); };

    RED.plugins.registerPlugin('node-red-flowgen', {
        onadd: function () {
            RED.log.info('node-red-flowgen: API Spec import tab available');
        }
    });

    function unzip(buffer, done) {
        const yauzl = require('yauzl');
        yauzl.fromBuffer(buffer, { lazyEntries: true }, function (err, zip) {
            if (err) { return done(err); }
            const files = [];
            let failed = false;
            const fail = function (e) { if (!failed) { failed = true; done(e); } };
            zip.on('error', fail);
            zip.on('end', function () { if (!failed) { done(null, files); } });
            zip.on('entry', function (entry) {
                const name = String(entry.fileName).replace(/\\/g, '/');
                if (/\/$/.test(name) || !/\.(bru|ya?ml|json)$/.test(name) ||
                        /(^|\/)(\.git|node_modules)\//.test(name)) {
                    return zip.readEntry();
                }
                zip.openReadStream(entry, function (streamErr, stream) {
                    if (streamErr) { return fail(streamErr); }
                    const chunks = [];
                    stream.on('data', function (c) { chunks.push(c); });
                    stream.on('error', fail);
                    stream.on('end', function () {
                        files.push({ path: name, text: Buffer.concat(chunks).toString('utf8') });
                        zip.readEntry();
                    });
                });
            });
            zip.readEntry();
        });
    }

    function gather(root) {
        const files = [];
        // git clones symbolic links as links, so a repository can ship
        // link.yaml -> /etc/passwd and have its contents read back. Links are
        // skipped outright, and every path is resolved and checked to be
        // inside the clone before it is opened, which also covers a link
        // sitting on one of the parent directories.
        const base = fs.realpathSync(root);
        const inside = target => {
            const resolved = fs.realpathSync(target);
            return resolved === base || resolved.startsWith(base + path.sep);
        };
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === '.git' || entry.name === 'node_modules') { continue; }
                if (entry.isSymbolicLink()) { continue; }
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (inside(full)) { walk(full); }
                } else if (entry.isFile() && /\.(bru|ya?ml|json)$/.test(entry.name)) {
                    if (!inside(full)) { continue; }
                    files.push({
                        path: path.relative(base, full),
                        text: fs.readFileSync(full, 'utf8')
                    });
                }
            }
        };
        walk(base);
        return files;
    }

    function fetchText(url, redirects, done) {
        let mod;
        try { mod = require(url.startsWith('https:') ? 'https' : 'http'); }
        catch (err) { return done(err); }
        const request = mod.get(url, { timeout: 30000 }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (redirects <= 0) { return done(new Error('too many redirects')); }
                return fetchText(new URL(res.headers.location, url).toString(), redirects - 1, done);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return done(new Error('HTTP ' + res.statusCode + ' from ' + url));
            }
            const chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () { done(null, Buffer.concat(chunks).toString('utf8')); });
        });
        request.on('timeout', function () { request.destroy(new Error('timed out')); });
        request.on('error', done);
    }

    RED.httpAdmin.get('/flowgen/source', needsPermission, function (req, res) {
        const url = String(req.query.url || '').trim();
        if (!/^https?:\/\/\S+$/i.test(url)) {
            return res.status(400).json({ error: 'only http(s) URLs are accepted' });
        }
        if (/\.git$/.test(url)) {
            const os = require('os');
            const { execFile } = require('child_process');
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-git-'));
            const finish = function (err) {
                try {
                    if (err) {
                        return res.status(502).json({ error: 'git clone failed: ' +
                            String(err).trim().split('\n')[0] });
                    }
                    res.json({ files: gather(tmp) });
                } finally {
                    fs.rm(tmp, {
                        recursive: true, force: true, maxRetries: 5, retryDelay: 100
                    }, function () {});
                }
            };
            return execFile('git', ['clone', '--quiet', '--depth', '1', url, tmp],
                { timeout: 60000 }, function (err, stdout, stderr) {
                if (!err) { return finish(null); }
                if (!/shallow/i.test(String(stderr))) { return finish(stderr || err.message); }
                fs.rmSync(tmp, {
                    recursive: true, force: true, maxRetries: 5, retryDelay: 100
                });
                fs.mkdirSync(tmp, { recursive: true });
                execFile('git', ['clone', '--quiet', url, tmp], { timeout: 60000 },
                    function (err2, stdout2, stderr2) {
                    finish(err2 ? (stderr2 || err2.message) : null);
                });
            });
        }
        fetchText(url, 5, function (err, text) {
            if (err) { return res.status(502).json({ error: err.message }); }
            res.json({ text: text });
        });
    });

    RED.httpAdmin.post('/flowgen/source', needsPermission, function (req, res) {
        const chunks = [];
        let size = 0;
        req.on('data', function (chunk) {
            size += chunk.length;
            if (size > 50 * 1024 * 1024) { req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on('end', function () {
            unzip(Buffer.concat(chunks), function (err, files) {
                if (err) {
                    return res.status(400).json({ error: 'could not read the zip file: ' + err.message });
                }
                res.json({ files: files });
            });
        });
    });

    RED.httpAdmin.get('/flowgen/:asset', needsPermission, function (req, res) {
        const file = assets[req.params.asset];
        if (!file) return res.status(404).end();
        res.type('application/javascript').sendFile(file);
    });
};
