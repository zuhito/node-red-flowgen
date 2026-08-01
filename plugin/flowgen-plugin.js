module.exports = function (RED) {
  const path = require('path');

  const assets = {
    'flowgen.js': path.join(__dirname, '..', 'flowgen.js'),
    'js-yaml.min.js': path.join(
      path.dirname(require.resolve('js-yaml/package.json')), 'dist', 'js-yaml.min.js')
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
