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
    'flowgen.js': path.join(__dirname, 'flowgen.js'),
    'js-yaml.min.js': browserYaml()
  };

  RED.plugins.registerPlugin('node-red-flowgen', {
    onadd: function () {
      RED.log.info('node-red-flowgen: API Spec import tab available');
    }
  });

  function gather(root) {
    const files = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') { continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); }
        else if (/\.(bru|ya?ml|json)$/.test(entry.name)) {
          files.push({ path: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
        }
      }
    };
    walk(root);
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

  RED.httpAdmin.get('/flowgen/collection', function (req, res) {
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
          fs.rm(tmp, { recursive: true, force: true }, function () {});
        }
      };
      return execFile('git', ['clone', '--quiet', '--depth', '1', url, tmp],
        { timeout: 60000 }, function (err, stdout, stderr) {
        if (!err) { return finish(null); }
        if (!/shallow/i.test(String(stderr))) { return finish(stderr || err.message); }
        fs.rmSync(tmp, { recursive: true, force: true });
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

  RED.httpAdmin.post('/flowgen/collection', function (req, res) {
    const chunks = [];
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > 50 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try {
        const AdmZip = require('adm-zip');
        const files = [];
        for (const entry of new AdmZip(Buffer.concat(chunks)).getEntries()) {
          if (entry.isDirectory) { continue; }
          if (!/\.(bru|ya?ml|json)$/.test(entry.entryName)) { continue; }
          if (/(^|\/)(\.git|node_modules)\//.test(entry.entryName)) { continue; }
          files.push({ path: entry.entryName, text: entry.getData().toString('utf8') });
        }
        res.json({ files: files });
      } catch (err) {
        res.status(400).json({ error: 'could not read the zip file: ' + err.message });
      }
    });
  });

  RED.httpAdmin.get('/flowgen/:asset', function (req, res) {
    const file = assets[req.params.asset];
    if (!file) return res.status(404).end();
    res.type('application/javascript').sendFile(file);
  });
};
