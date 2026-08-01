'use strict';
const https = require('https');
function call(label, urlPath, headers) {
  return new Promise(resolve => {
    const req = https.request({ host: 'petstore3.swagger.io', path: urlPath, method: 'GET', headers },
      res => { const c=[]; res.on('data',d=>c.push(d)); res.on('end',()=>{
        process.stdout.write('::notice::' + label + ' -> ' + res.statusCode + ' ' +
          Buffer.concat(c).toString().slice(0,120).replace(/\s+/g,' ') + '\n'); resolve(); }); });
    req.on('error', e => { process.stdout.write('::notice::'+label+' -> ERR '+e.message+'\n'); resolve(); });
    req.end();
  });
}
(async () => {
  const p1 = '/api/v3/store/inventory';
  await call('inv bare', p1, {});
  await call('inv accept', p1, { accept: 'application/json' });
  await call('inv emptyApiKey', p1, { api_key: '' });
  await call('inv apiKey+accept', p1, { api_key: '', accept: 'application/json' });
  await call('inv specialKey', p1, { api_key: 'special-key', accept: 'application/json' });
  const p2 = '/api/v3/pet/findByStatus?status=available';
  await call('fbs bare', p2, {});
  await call('fbs accept', p2, { accept: 'application/json' });
  await call('fbs emptyAuth', p2, { authorization: 'Bearer ' });
  await call('fbs emptyAuth+accept', p2, { authorization: 'Bearer ', accept: 'application/json' });
  const p3 = '/api/v3/pet/findByStatus';
  await call('fbs noQuery', p3, { accept: 'application/json' });
  await call('fbs emptyQuery', p3 + '?status=', { accept: 'application/json' });
})();
