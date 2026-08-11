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

    const UNZIP_LIMITS = {
        totalBytes: 64 * 1024 * 1024,
        entryBytes: 16 * 1024 * 1024,
        entries: 2000
    };

    function unzip(buffer, done) {
        const yauzl = require('yauzl');
        yauzl.fromBuffer(buffer, { lazyEntries: true }, function (err, zip) {
            if (err) { return done(err); }
            const files = [];
            let failed = false;
            let total = 0;
            let taken = 0;
            const fail = function (e) {
                if (failed) { return; }
                failed = true;
                try { zip.close(); } catch (closeErr) { /* already closing */ }
                done(e);
            };
            zip.on('error', fail);
            zip.on('end', function () { if (!failed) { done(null, files); } });
            zip.on('entry', function (entry) {
                if (failed) { return; }
                const name = String(entry.fileName).replace(/\\/g, '/');
                if (/\/$/.test(name) || !/\.(bru|ya?ml|json)$/.test(name) ||
                        /(^|\/)(\.git|node_modules)\//.test(name)) {
                    return zip.readEntry();
                }
                if (++taken > UNZIP_LIMITS.entries) {
                    return fail(new Error('the archive holds more than ' +
                        UNZIP_LIMITS.entries + ' usable files'));
                }
                if (entry.uncompressedSize > UNZIP_LIMITS.entryBytes) {
                    return fail(new Error(name + ' expands to ' +
                        entry.uncompressedSize + ' bytes, over the ' +
                        UNZIP_LIMITS.entryBytes + ' byte limit for one file'));
                }
                if (total + entry.uncompressedSize > UNZIP_LIMITS.totalBytes) {
                    return fail(new Error('the archive expands past the ' +
                        UNZIP_LIMITS.totalBytes + ' byte limit'));
                }
                zip.openReadStream(entry, function (streamErr, stream) {
                    if (streamErr) { return fail(streamErr); }
                    const chunks = [];
                    let read = 0;
                    stream.on('data', function (c) {
                        if (failed) { return; }
                        read += c.length;
                        total += c.length;
                        if (read > UNZIP_LIMITS.entryBytes ||
                                total > UNZIP_LIMITS.totalBytes) {
                            stream.destroy();
                            return fail(new Error(name +
                                ' is larger than its header claimed'));
                        }
                        chunks.push(c);
                    });
                    stream.on('error', fail);
                    stream.on('end', function () {
                        if (failed) { return; }
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

    const CLONE_OPTIONS = {
        timeout: 60000,
        env: Object.assign({}, process.env, {
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            SSH_ASKPASS: '',
            GCM_INTERACTIVE: 'never'
        })
    };

    function redact(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@');
    }

    function gitUrl(url) {
        let parsed;
        try { parsed = new URL(url); } catch (err) { return null; }
        if (!parsed.hostname) { return null; }

        if (!/^git:$/i.test(parsed.protocol)) {
            return /^https?:$/.test(parsed.protocol) ? url : null;
        }
        const local = parsed.hostname === 'localhost' ||
            /^127\./.test(parsed.hostname) || parsed.hostname === '::1';
        return url.replace(/^git:/i, local ? 'http:' : 'https:');
    }

    RED.httpAdmin.get('/flowgen/source', needsPermission, function (req, res) {
        const url = String(req.query.url || '').trim();
        if (!/^(https?|git):\/\/\S+$/i.test(url)) {
            return res.status(400).json({ error: 'only http(s) and git URLs are accepted' });
        }
        if (/\.git$/.test(url)) {
            const target = gitUrl(url);
            if (!target) {
                return res.status(400).json({ error: 'that is not a usable git URL' });
            }
            const os = require('os');
            const { execFile } = require('child_process');
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-git-'));
            const finish = function (err) {
                try {
                    if (err) {
                        return res.status(502).json({ error: 'git clone failed: ' +
                            redact(String(err).trim().split('\n')[0]) });
                    }
                    res.json({ files: gather(tmp) });
                } finally {
                    fs.rm(tmp, {
                        recursive: true, force: true, maxRetries: 5, retryDelay: 100
                    }, function () {});
                }
            };
            return execFile('git', ['clone', '--quiet', '--depth', '1', target, tmp],
                CLONE_OPTIONS, function (err, stdout, stderr) {
                if (!err) { return finish(null); }
                if (!/shallow/i.test(String(stderr))) { return finish(stderr || err.message); }
                fs.rmSync(tmp, {
                    recursive: true, force: true, maxRetries: 5, retryDelay: 100
                });
                fs.mkdirSync(tmp, { recursive: true });
                execFile('git', ['clone', '--quiet', target, tmp], CLONE_OPTIONS,
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

    const flowgen = require('./flowgen');

    const MAX_TEXT = 16 * 1024 * 1024;

    function tooLarge(body) {
        if (typeof body.text === 'string' && body.text.length > MAX_TEXT) {
            return 'the definition is larger than ' + MAX_TEXT + ' characters';
        }
        if (Array.isArray(body.files)) {
            let total = 0;
            for (const file of body.files) {
                total += String((file && file.text) || '').length;
                if (total > MAX_TEXT) {
                    return 'the collection is larger than ' + MAX_TEXT + ' characters';
                }
            }
        }
        return null;
    }

    RED.httpAdmin.post('/flowgen/parse', needsPermission, function (req, res) {
        const body = req.body || {};
        const oversized = tooLarge(body);
        if (oversized) { return res.status(413).json({ error: oversized }); }
        try {
            const doc = body.files
                ? flowgen.parseCollection(body.files)
                : flowgen.parseDocument(String(body.text === undefined ? '' : body.text));
            const listed = flowgen.listOperations(doc);
            res.json({ doc: doc, count: listed.count, operations: listed.operations });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    RED.httpAdmin.post('/flowgen/flows', needsPermission, function (req, res) {
        const body = req.body || {};
        try {
            res.json({
                nodes: flowgen.buildFlows(body.doc, body.targets || [], { tab: false })
            });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    RED.httpAdmin.get('/flowgen/:asset', needsPermission, function (req, res) {
        const file = assets[req.params.asset];
        if (!file) return res.status(404).end();
        res.type('application/javascript').sendFile(file);
    });
};
