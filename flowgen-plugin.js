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

  RED.httpAdmin.get('/flowgen/:asset', function (req, res) {
    const file = assets[req.params.asset];
    if (!file) return res.status(404).end();
    res.type('application/javascript').sendFile(file);
  });
};
