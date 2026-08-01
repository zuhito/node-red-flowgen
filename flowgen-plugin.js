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

  RED.httpAdmin.get('/flowgen/collection', function (req, res) {
    const os = require('os');
    const { execFile } = require('child_process');
    const url = String(req.query.url || '').trim();
    if (!/\.git$/.test(url)) {
      return res.status(400).json({ error: 'only git repository URLs ending in .git are accepted' });
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-git-'));
    execFile('git', ['clone', '--quiet', '--depth', '1', url, tmp],
      { timeout: 60000 }, function (err, stdout, stderr) {
      try {
        if (err) {
          return res.status(502).json({ error: 'git clone failed: ' +
            String(stderr || err.message).trim().split('\n')[0] });
        }
        res.json({ files: gather(tmp) });
      } finally {
        fs.rm(tmp, { recursive: true, force: true }, function () {});
      }
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
