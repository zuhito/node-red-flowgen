'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const flowgen = require('../flowgen');
const specs = require('./specs');


function run(code) {
  return new Function('msg', code)({});
}

function comments(code) {
  return code.split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3));
}

function v3(paths, extra) {
  return Object.assign({
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    servers: [{ url: 'https://api.test/v1' }],
    paths: paths
  }, extra || {});
}

function v2(paths, extra) {
  return Object.assign({
    swagger: '2.0',
    info: { title: 'T', version: '1' },
    host: 'api.test',
    basePath: '/v1',
    schemes: ['https'],
    paths: paths
  }, extra || {});
}

test('detectFormat', () => {
  assert.strictEqual(flowgen.detectFormat({ openapi: '3.0.3' }), 'openapi3');
  assert.strictEqual(flowgen.detectFormat({ openapi: '3.1.0' }), 'openapi3');
  assert.strictEqual(flowgen.detectFormat({ swagger: '2.0' }), 'swagger2');
  assert.throws(() => flowgen.detectFormat({}), /unknown format/);
  assert.throws(() => flowgen.detectFormat({ swagger: '1.2' }), /unknown format/);
});

test('parseDocument accepts JSON and YAML', () => {
  assert.deepStrictEqual(flowgen.parseDocument('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(flowgen.parseDocument('\uFEFF  {"a":1}'), { a: 1 });
  assert.deepStrictEqual(flowgen.parseDocument('a: 1\nb:\n  - 2\n'), { a: 1, b: [2] });
  assert.throws(() => flowgen.parseDocument('just a string'), /failed to parse/);
});

test('minimal operation emits only method, url and return', () => {
  const code = flowgen.generate(v3({ '/x': { get: {} } }), 'get', '/x');
  assert.strictEqual(code, [
    "msg.method = `GET`;",
    "msg.url = `https://api.test/v1/x`;",
    'return msg;'
  ].join('\n'));
});

test('target accepts path with or without leading slash, method is case insensitive', () => {
  const doc = v3({ '/x': { get: {} } });
  assert.strictEqual(flowgen.generate(doc, 'GET', '/x'), flowgen.generate(doc, 'get', 'x'));
});

test('no description or summary is emitted as a comment', () => {
  const doc = v3({ '/x': { get: { summary: 'S', description: 'line one\n\nline two' } } });
  const code = flowgen.generate(doc, 'get', '/x');
  assert.deepStrictEqual(comments(code), []);
  assert.ok(!/line one|S/.test(code));
  assert.ok(code.startsWith("msg.method = `GET`;"));
});

test('server variables resolve and trailing slash is trimmed', () => {
  const doc = v3({ '/x': { get: {} } }, {
    servers: [{
      url: 'https://{region}.test/{ver}/',
      variables: { region: { default: 'tokyo' }, ver: { enum: ['v2', 'v3'] } }
    }]
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://tokyo.test/v2/x');
});

test('server precedence is operation, path item, document', () => {
  const doc = v3({
    '/x': {
      servers: [{ url: 'https://item.test' }],
      get: { servers: [{ url: 'https://op.test' }] },
      put: {}
    }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://op.test/x');
  assert.strictEqual(run(flowgen.generate(doc, 'put', '/x')).url, 'https://item.test/x');
});

test('missing servers yields a relative url', () => {
  const doc = { openapi: '3.0.0', info: {}, paths: { '/x': { get: {} } } };
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, '/x');
});

test('path parameters stay as placeholders', () => {
  const doc = v3({ '/a/{id}/b/{sub}': { get: { parameters: [{ name: 'id', in: 'path' }] } } });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/a/{id}/b/{sub}')).url,
    'https://api.test/v1/a/{id}/b/{sub}');
});

test('query parameters are appended in order with ? then &', () => {
  const doc = v3({
    '/x': {
      parameters: [{ name: 'shared', in: 'query' }],
      get: { parameters: [{ name: 'a', in: 'query' }, { name: 'b', in: 'query' }] }
    }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url,
    'https://api.test/v1/x?a={a}&b={b}&shared={shared}');
  assert.deepStrictEqual(comments(flowgen.generate(doc, 'get', '/x')),
    ['Replace {a}, {b} and {shared} in the URL below with real values.']);
});

test('duplicate parameters keep the operation level one', () => {
  const doc = v3({
    '/x': {
      parameters: [{ name: 'a', in: 'query', description: 'item' }],
      get: { parameters: [{ name: 'a', in: 'query', description: 'op' }] }
    }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?a={a}');
});

test('header and cookie parameters become objects', () => {
  const doc = v3({
    '/x': { get: { parameters: [{ name: 'X-A', in: 'header' }, { name: 'sid', in: 'cookie' }] } }
  });
  const msg = run(flowgen.generate(doc, 'get', '/x'));
  assert.deepStrictEqual(msg.headers, { 'X-A': '' });
  assert.deepStrictEqual(msg.cookies, { sid: '' });
});

test('$ref parameters are resolved', () => {
  const doc = v3({ '/x': { get: { parameters: [{ $ref: '#/components/parameters/P' }] } } }, {
    components: { parameters: { P: { name: 'page', in: 'query' } } }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?page={page}');
});

test('security schemes map to the right msg properties', () => {
  const schemes = {
    hdr: { type: 'apiKey', in: 'header', name: 'X-Key' },
    qry: { type: 'apiKey', in: 'query', name: 'key' },
    cke: { type: 'apiKey', in: 'cookie', name: 'SID' },
    basic: { type: 'http', scheme: 'basic' },
    bearer: { type: 'http', scheme: 'bearer' },
    oauth: { type: 'oauth2', flows: {} },
    oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://x' },
    mtls: { type: 'mutualTLS' }
  };
  const build = security => v3({ '/x': { get: { security: security } } }, {
    components: { securitySchemes: schemes }
  });
  const msg = run(flowgen.generate(build([{ hdr: [], qry: [], cke: [] }]), 'get', '/x'));
  assert.deepStrictEqual(msg.headers, { 'X-Key': '' });
  assert.deepStrictEqual(msg.cookies, { SID: '' });
  assert.strictEqual(msg.url, 'https://api.test/v1/x?key={key}');

  const auth = s => run(flowgen.generate(build([s]), 'get', '/x')).headers.authorization;
  assert.strictEqual(auth({ basic: [] }), 'Basic ');
  assert.strictEqual(auth({ bearer: [] }), 'Bearer ');
  assert.strictEqual(auth({ oauth: [] }), 'Bearer ');
  assert.strictEqual(auth({ oidc: [] }), 'Bearer ');
  assert.strictEqual(run(flowgen.generate(build([{ mtls: [] }]), 'get', '/x')).headers, undefined);
});

test('operation security overrides the document and an empty array disables it', () => {
  const base = {
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }
  };
  const inherited = v3({ '/x': { get: {} } }, base);
  assert.strictEqual(run(flowgen.generate(inherited, 'get', '/x')).headers.authorization, 'Bearer ');
  const disabled = v3({ '/x': { get: { security: [] } } }, base);
  assert.strictEqual(run(flowgen.generate(disabled, 'get', '/x')).headers, undefined);
});

test('request body is sampled from the schema', () => {
  const doc = v3({
    '/x': {
      post: {
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } }
        }
      }
    }
  }, {
    components: {
      schemas: {
        Pet: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'doggie' },
            ok: { type: 'boolean' },
            status: { type: 'string', enum: ['available', 'sold'] },
            tags: { type: 'array', items: { type: 'string' } },
            next: { $ref: '#/components/schemas/Pet' }
          }
        }
      }
    }
  });
  const msg = run(flowgen.generate(doc, 'post', '/x'));
  assert.deepStrictEqual(msg.payload, {
    id: 0, name: 'doggie', ok: false, status: 'available', tags: [''], next: null
  });
  assert.strictEqual(msg.headers['content-type'], 'application/json');
});

test('allOf merges and oneOf takes the first branch', () => {
  const doc = v3({
    '/a': { post: { requestBody: { content: { 'application/json': { schema: {
      allOf: [{ type: 'object', properties: { a: { type: 'integer' } } },
              { type: 'object', properties: { b: { type: 'string' } } }] } } } } } },
    '/b': { post: { requestBody: { content: { 'application/json': { schema: {
      oneOf: [{ type: 'object', properties: { x: { type: 'boolean' } } },
              { type: 'string' }] } } } } } }
  });
  assert.deepStrictEqual(run(flowgen.generate(doc, 'post', '/a')).payload, { a: 0, b: '' });
  assert.deepStrictEqual(run(flowgen.generate(doc, 'post', '/b')).payload, { x: false });
});

test('media type example wins over the schema', () => {
  const doc = v3({ '/x': { post: { requestBody: { content: { 'application/json': {
    example: { hello: 'world' }, schema: { type: 'object', properties: { a: { type: 'string' } } }
  } } } } } });
  assert.deepStrictEqual(run(flowgen.generate(doc, 'post', '/x')).payload, { hello: 'world' });
});

test('json media type is preferred and text bodies become strings', () => {
  const doc = v3({
    '/a': { post: { requestBody: { content: { 'text/plain': {}, 'application/json': {} } } } },
    '/b': { post: { requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } } } },
    '/c': { post: { requestBody: { content: { 'application/octet-stream': {} } } } }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'post', '/a')).headers['content-type'], 'application/json');
  assert.strictEqual(run(flowgen.generate(doc, 'post', '/b')).payload, '');
  assert.strictEqual(run(flowgen.generate(doc, 'post', '/c')).payload, '');
});

test('GET and HEAD never carry a body', () => {
  const doc = v3({ '/x': {
    get: { requestBody: { content: { 'application/json': {} } } },
    head: { requestBody: { content: { 'application/json': {} } } }
  } });
  assert.ok(!('payload' in run(flowgen.generate(doc, 'get', '/x'))));
  assert.ok(!('payload' in run(flowgen.generate(doc, 'head', '/x'))));
});

test('accept comes from a 2xx response and headers are deduplicated', () => {
  const doc = v3({ '/x': { get: {
    parameters: [{ name: 'Accept', in: 'header' }],
    responses: {
      default: { content: { 'text/html': {} } },
      200: { content: { 'application/xml': {}, 'application/json': {} } }
    }
  } } });
  const headers = run(flowgen.generate(doc, 'get', '/x')).headers;
  assert.deepStrictEqual(Object.keys(headers), ['Accept']);
  assert.strictEqual(headers.Accept, 'application/json');
});

test('swagger 2.0 builds the url from schemes, host and basePath', () => {
  assert.strictEqual(run(flowgen.generate(v2({ '/x': { get: {} } }), 'get', '/x')).url,
    'https://api.test/v1/x');
  const noHost = { swagger: '2.0', info: {}, basePath: '/v1', paths: { '/x': { get: {} } } };
  assert.strictEqual(run(flowgen.generate(noHost, 'get', '/x')).url, '/v1/x');
});

test('swagger 2.0 body parameter becomes the payload', () => {
  const doc = v2({ '/x': { post: {
    consumes: ['application/json'],
    produces: ['application/json'],
    parameters: [{ name: 'body', in: 'body', schema: { $ref: '#/definitions/P' } }]
  } } }, { definitions: { P: { type: 'object', properties: { n: { type: 'integer' } } } } });
  const msg = run(flowgen.generate(doc, 'post', '/x'));
  assert.deepStrictEqual(msg.payload, { n: 0 });
  assert.strictEqual(msg.headers['content-type'], 'application/json');
  assert.strictEqual(msg.headers.accept, 'application/json');
});

test('swagger 2.0 multipart formData follows the http request node file upload shape', () => {
  const doc = v2({ '/x': { post: {
    consumes: ['multipart/form-data'],
    parameters: [{ name: 'file', in: 'formData', type: 'file' },
                 { name: 'note', in: 'formData', type: 'string' }]
  } } });
  const code = flowgen.generate(doc, 'post', '/x');
  const msg = run(code);
  assert.deepStrictEqual(msg.payload, {
    file: { value: 'FILE_CONTENTS', options: { filename: 'FILENAME' } },
    note: ''
  });
  assert.strictEqual(msg.headers['content-type'], 'multipart/form-data');
  assert.match(code, /\/\/ Set FILE_CONTENTS and the filename/);
});

test('swagger 2.0 urlencoded formData stays a flat object', () => {
  const doc = v2({ '/x': { post: {
    consumes: ['application/x-www-form-urlencoded'],
    parameters: [{ name: 'user', in: 'formData', type: 'string' }]
  } } });
  assert.deepStrictEqual(run(flowgen.generate(doc, 'post', '/x')).payload, { user: '' });
});

test('openapi 3 multipart binary fields follow the file upload shape', () => {
  const doc = v3({ '/x': { post: { requestBody: { content: { 'multipart/form-data': {
    schema: { type: 'object', properties: {
      file: { type: 'string', format: 'binary' },
      note: { type: 'string' }
    } }
  } } } } } });
  const msg = run(flowgen.generate(doc, 'post', '/x'));
  assert.deepStrictEqual(msg.payload, {
    file: { value: 'FILE_CONTENTS', options: { filename: 'FILENAME' } },
    note: ''
  });
});

test('swagger 2.0 security definitions map to msg properties', () => {
  const defs = {
    basic: { type: 'basic' },
    key: { type: 'apiKey', in: 'header', name: 'api_key' },
    qry: { type: 'apiKey', in: 'query', name: 'k' },
    oauth: { type: 'oauth2', flow: 'implicit' }
  };
  const build = security => v2({ '/x': { get: { security: security } } }, { securityDefinitions: defs });
  assert.strictEqual(run(flowgen.generate(build([{ basic: [] }]), 'get', '/x')).headers.authorization, 'Basic ');
  assert.strictEqual(run(flowgen.generate(build([{ oauth: [] }]), 'get', '/x')).headers.authorization, 'Bearer ');
  assert.deepStrictEqual(run(flowgen.generate(build([{ key: [] }]), 'get', '/x')).headers, { api_key: '' });
  assert.strictEqual(run(flowgen.generate(build([{ qry: [] }]), 'get', '/x')).url, 'https://api.test/v1/x?k={k}');
  assert.strictEqual(run(flowgen.generate(build([{ key: [] }]), 'get', '/x')).cookies, undefined);
});

test('listOperations reports format, count and entries', () => {
  const doc = v3({
    '/a': { get: { summary: 'A' }, post: {} },
    '/b': { delete: {} }
  });
  assert.deepStrictEqual(flowgen.listOperations(doc), {
    format: 'openapi3',
    count: 3,
    operations: [
      { method: 'get', path: '/a', summary: 'A' },
      { method: 'post', path: '/a', summary: null },
      { method: 'delete', path: '/b', summary: null }
    ]
  });
});

test('unknown target and method raise errors', () => {
  const doc = v3({ '/x': { get: {} } });
  assert.throws(() => flowgen.generate(doc, 'get', '/nope'), /not found: get \/nope/);
  assert.throws(() => flowgen.generate(doc, 'get', '/nope'), /available:\n {2}get \/x/);
  assert.throws(() => flowgen.generate(doc, 'fetch', '/x'), /unsupported method/);
});

test('quoting survives hostile strings', () => {
  const doc = v3({ "/it's": { get: { parameters: [
    { name: 'q', in: 'query', schema: { example: "a'b\\c" } }] } } });
  const msg = run(flowgen.generate(doc, 'get', "/it's"));
  assert.strictEqual(msg.url, "https://api.test/v1/it's?q=a'b%5Cc");
});

for (const label of ['v2', 'v3']) {
  test('petstore ' + label + ': every operation compiles to a usable msg', async () => {
    const doc = flowgen.parseDocument(await specs.spec(label));
    const list = flowgen.listOperations(doc);
    assert.strictEqual(list.format, label === 'v2' ? 'swagger2' : 'openapi3');
    assert.ok(list.count > 0);

    for (const entry of list.operations) {
      const msg = run(flowgen.generate(doc, entry.method, entry.path));
      assert.strictEqual(msg.method, entry.method.toUpperCase());
      assert.strictEqual(typeof msg.url, 'string');
      assert.ok(msg.url.length > 0);
      assert.ok(!/undefined|\[object/.test(msg.url), 'malformed url: ' + msg.url);
      new URL(msg.url.replace(/\{[^}]*\}/g, 'x'));
      if (msg.headers) assert.strictEqual(typeof msg.headers, 'object');
      if (msg.cookies) assert.strictEqual(typeof msg.cookies, 'object');
      if ('payload' in msg) assert.ok(!['get', 'head'].includes(entry.method));
    }
  });

  test('petstore ' + label + ': every operation builds a valid flow', async () => {
    const doc = flowgen.parseDocument(await specs.spec(label));
    for (const entry of flowgen.listOperations(doc).operations) {
      const flow = JSON.parse(JSON.stringify(flowgen.buildFlow(doc, entry.method, entry.path)));
      assert.deepStrictEqual(flow.map(n => n.type),
        ['tab', 'inject', 'function', 'http request', 'debug']);
      const ids = flow.map(n => n.id);
      for (const node of flow) {
        for (const wire of [].concat.apply([], node.wires || [])) assert.ok(ids.includes(wire));
      }
      run(flow.find(n => n.type === 'function').func);
    }
  });
}

test('petstore v3 known operation', async () => {
  const doc = flowgen.parseDocument(await specs.spec('v3'));
  const msg = run(flowgen.generate(doc, 'get', '/pet/{petId}'));
  assert.strictEqual(msg.url, 'https://petstore3.swagger.io/api/v3/pet/{petId}');
  assert.strictEqual(msg.headers.api_key, '');
  assert.strictEqual(msg.headers.accept, 'application/json');
});

test('petstore v2 known operation', async () => {
  const doc = flowgen.parseDocument(await specs.spec('v2'));
  const msg = run(flowgen.generate(doc, 'post', '/pet'));
  assert.strictEqual(msg.url, 'http://petstore.swagger.io/v2/pet');
  assert.strictEqual(msg.headers['content-type'], 'application/json');
  assert.strictEqual(msg.payload.name, 'doggie');
});

test('buildFlow can omit the tab so nodes land in the current flow', () => {
  const doc = v3({ '/x': { get: {} } });
  const nodes = flowgen.buildFlow(doc, 'get', '/x', { tab: false });
  assert.deepStrictEqual(nodes.map(n => n.type),
    ['inject', 'function', 'http request', 'debug']);
  assert.ok(!nodes.some(n => 'z' in n));

  const ids = nodes.map(n => n.id);
  for (const node of nodes) {
    for (const wire of [].concat.apply([], node.wires || [])) assert.ok(ids.includes(wire));
  }
  assert.strictEqual(nodes.find(n => n.type === 'function').func,
    flowgen.generate(doc, 'get', '/x'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nodes)), nodes);
});

test('buildFlow keeps the tab by default and when asked', () => {
  const doc = v3({ '/x': { get: {} } });
  const withTab = flowgen.buildFlow(doc, 'get', '/x');
  assert.strictEqual(withTab[0].type, 'tab');
  assert.strictEqual(flowgen.buildFlow(doc, 'get', '/x', {})[0].type, 'tab');
  assert.strictEqual(flowgen.buildFlow(doc, 'get', '/x', { tab: true })[0].type, 'tab');
  for (const node of withTab.slice(1)) assert.strictEqual(node.z, withTab[0].id);
});

function urlLinesOf(code) {
  return code.split('\n').filter(l => /msg\.url = /.test(l));
}

test('an enum fills the first value and comments out the rest', () => {
  const doc = v3({ '/x': { get: { parameters: [
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['A', 'B', 'C'] } }
  ] } } });
  assert.deepStrictEqual(urlLinesOf(flowgen.generate(doc, 'get', '/x')), [
    'msg.url = `https://api.test/v1/x?status=A`;',
    '// msg.url = `https://api.test/v1/x?status=B`;',
    '// msg.url = `https://api.test/v1/x?status=C`;'
  ]);
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?status=A');
});

test('example and default are used when there is no enum', () => {
  const doc = v3({
    '/a': { get: { parameters: [{ name: 'q', in: 'query', schema: { example: 'hello' } }] } },
    '/b': { get: { parameters: [{ name: 'q', in: 'query', schema: { default: 7 } }] } },
    '/c': { get: { parameters: [{ name: 'q', in: 'query', example: 'onparam' }] } }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/a')).url, 'https://api.test/v1/a?q=hello');
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/b')).url, 'https://api.test/v1/b?q=7');
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/c')).url, 'https://api.test/v1/c?q=onparam');
});

test('path parameters are filled from the spec and otherwise left as placeholders', () => {
  const doc = v3({
    '/p/{id}': { get: { parameters: [
      { name: 'id', in: 'path', schema: { example: 42 } }] } },
    '/q/{id}': { get: { parameters: [{ name: 'id', in: 'path' }] } }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/p/{id}')).url, 'https://api.test/v1/p/42');
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/q/{id}')).url, 'https://api.test/v1/q/{id}');
});

test('values are url encoded', () => {
  const doc = v3({ '/x/{id}': { get: { parameters: [
    { name: 'id', in: 'path', schema: { example: 'a b' } },
    { name: 'q', in: 'query', schema: { example: 'x&y' } }
  ] } } });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x/{id}')).url,
    'https://api.test/v1/x/a%20b?q=x%26y');
});

test('alternates vary one parameter at a time', () => {
  const doc = v3({ '/x': { get: { parameters: [
    { name: 'a', in: 'query', schema: { enum: ['1', '2'] } },
    { name: 'b', in: 'query', schema: { enum: ['x', 'y'] } }
  ] } } });
  assert.deepStrictEqual(urlLinesOf(flowgen.generate(doc, 'get', '/x')), [
    "msg.url = `https://api.test/v1/x?a=1&b=x`;",
    "// msg.url = `https://api.test/v1/x?a=2&b=x`;",
    "// msg.url = `https://api.test/v1/x?a=1&b=y`;"
  ]);
});

test('a single value produces exactly one url line', () => {
  const doc = v3({ '/x': { get: { parameters: [
    { name: 'q', in: 'query', schema: { enum: ['only'] } }] } } });
  assert.strictEqual(urlLinesOf(flowgen.generate(doc, 'get', '/x')).length, 1);
});

test('swagger 2 reads enum and default from the parameter itself', () => {
  const doc = v2({ '/x': { get: { parameters: [
    { name: 'status', in: 'query', type: 'string', enum: ['available', 'sold'] },
    { name: 'limit', in: 'query', type: 'integer', default: 10 }
  ] } } });
  assert.deepStrictEqual(urlLinesOf(flowgen.generate(doc, 'get', '/x')), [
    "msg.url = `https://api.test/v1/x?status=available&limit=10`;",
    "// msg.url = `https://api.test/v1/x?status=sold&limit=10`;"
  ]);
});

test('an array parameter uses the item enum', () => {
  const doc = v3({ '/x': { get: { parameters: [
    { name: 'tags', in: 'query', schema: { type: 'array', items: { enum: ['a', 'b'] } } }
  ] } } });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?tags=a');
});

test('an api key in the query becomes a placeholder', () => {
  const doc = v3({ '/x': { get: { security: [{ k: [] }] } } }, {
    components: { securitySchemes: { k: { type: 'apiKey', in: 'query', name: 'key' } } }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?key={key}');
});

test('nodes snap to the grid with a two cell gap between them', () => {
  const GRID = 20;
  const label = name => name === '' ? null : name;
  for (const target of ['/x', '/pet/{petId}/uploadImage']) {
    const doc = v3({ [target]: { get: {} } });
    const nodes = flowgen.buildFlow(doc, 'get', target, { tab: false });
    const labels = ['timestamp', 'GET ' + target, 'http request', 'msg.payload'];
    for (const node of nodes) {
      assert.strictEqual(node.x % GRID, 0, node.type + ' x=' + node.x + ' is off grid');
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const wLeft = flowgen.nodeWidth(labels[i], i > 0);
      const wRight = flowgen.nodeWidth(labels[i + 1], true);
      const gap = (nodes[i + 1].x - wRight / 2) - (nodes[i].x + wLeft / 2);
      assert.ok(gap >= 2 * GRID - GRID / 2 && gap <= 2 * GRID + GRID,
        'gap between ' + nodes[i].type + ' and ' + nodes[i + 1].type + ' is ' + gap);
    }
  }
});

test('the http request node returns a parsed JSON object', () => {
  const doc = v3({ '/x': { get: {} } });
  const request = flowgen.buildFlow(doc, 'get', '/x').find(n => n.type === 'http request');
  assert.strictEqual(request.ret, 'obj');
  assert.strictEqual(request.method, 'use');
});

test('isUrl recognises http and https sources only', () => {
  assert.strictEqual(flowgen.isUrl('https://petstore.swagger.io/v2/swagger.json'), true);
  assert.strictEqual(flowgen.isUrl('http://example.test/a.yaml'), true);
  assert.strictEqual(flowgen.isUrl('  https://example.test/a.yaml  '), true);
  assert.strictEqual(flowgen.isUrl('spec/petstore-v3.yaml'), false);
  assert.strictEqual(flowgen.isUrl('openapi: 3.0.0'), false);
  assert.strictEqual(flowgen.isUrl('ftp://example.test/a.yaml'), false);
  assert.strictEqual(flowgen.isUrl(''), false);
  assert.strictEqual(flowgen.isUrl(undefined), false);
});

function commentsOf(code) {
  return code.split('\n').filter(l => l.startsWith('// ') && !/msg\.url = /.test(l));
}

test('an unresolved path parameter is called out above the url', () => {
  const doc = v3({ '/pet/{petId}/uploadImage': { post: {
    parameters: [{ name: 'petId', in: 'path' }] } } });
  const code = flowgen.generate(doc, 'post', '/pet/{petId}/uploadImage');
  const lines = code.split('\n');
  const at = lines.findIndex(l => l.startsWith('msg.url = '));
  assert.strictEqual(lines[at - 1], '// Replace {petId} in the URL below with a real value.');
});

test('several unresolved path parameters are listed together', () => {
  const doc = v3({ '/a/{x}/b/{y}/c/{z}': { get: {} } });
  assert.ok(commentsOf(flowgen.generate(doc, 'get', '/a/{x}/b/{y}/c/{z}'))
    .includes('// Replace {x}, {y} and {z} in the URL below with real values.'));
});

test('a filled path parameter needs no comment', () => {
  const doc = v3({ '/pet/{petId}': { get: {
    parameters: [{ name: 'petId', in: 'path', schema: { example: 7 } }] } } });
  assert.deepStrictEqual(commentsOf(flowgen.generate(doc, 'get', '/pet/{petId}')), []);
});

test('empty headers and cookies are called out above their assignment', () => {
  const doc = v3({ '/x': { get: {
    parameters: [{ name: 'X-Key', in: 'header' }, { name: 'sid', in: 'cookie' }],
    responses: { 200: { content: { 'application/json': {} } } } } } });
  const lines = flowgen.generate(doc, 'get', '/x').split('\n');
  const headerAt = lines.findIndex(l => l.startsWith('msg.headers = '));
  const cookieAt = lines.findIndex(l => l.startsWith('msg.cookies = '));
  assert.strictEqual(lines[headerAt - 1], "// Fill in 'X-Key' below.");
  assert.strictEqual(lines[cookieAt - 1], "// Fill in 'sid' below.");
});

test('an authorization header awaiting a token is called out', () => {
  const doc = v3({ '/x': { get: { security: [{ b: [] }] } } }, {
    components: { securitySchemes: { b: { type: 'http', scheme: 'bearer' } } }
  });
  assert.ok(commentsOf(flowgen.generate(doc, 'get', '/x'))
    .includes("// Fill in 'authorization' below."));
});

test('headers that are fully determined get no comment', () => {
  const doc = v3({ '/x': { get: {
    responses: { 200: { content: { 'application/json': {} } } } } } });
  assert.deepStrictEqual(commentsOf(flowgen.generate(doc, 'get', '/x')), []);
});

test('a request body is called out above the payload', () => {
  const doc = v3({ '/x': { post: { requestBody: {
    content: { 'application/json': { schema: { type: 'object' } } } } } } });
  const lines = flowgen.generate(doc, 'post', '/x').split('\n');
  const at = lines.findIndex(l => l.startsWith('msg.payload = '));
  assert.strictEqual(lines[at - 1], '// Adjust the request body below to suit the call.');
});

test('parameter types appear in the guidance comments', () => {
  const doc = v3({ '/pet/{petId}': { get: {
    parameters: [
      { name: 'petId', in: 'path', schema: { type: 'integer' } },
      { name: 'X-Trace', in: 'header', schema: { type: 'string' } }
    ] } } });
  const code = flowgen.generate(doc, 'get', '/pet/{petId}');
  assert.match(code, /\/\/ Replace \{petId\} \(integer\) in the URL below with a real value\./);
  assert.match(code, /\/\/ Fill in 'X-Trace' \(string\) below\./);
});

test('a missing type leaves the comment untyped', () => {
  const doc = v3({ '/pet/{petId}': { get: { parameters: [{ name: 'petId', in: 'path' }] } } });
  assert.match(flowgen.generate(doc, 'get', '/pet/{petId}'),
    /\/\/ Replace \{petId\} in the URL below with a real value\./);
});

test('array parameter types read naturally', () => {
  const doc = v2({ '/x/{ids}': { get: { parameters: [
    { name: 'ids', in: 'path', type: 'array', items: { type: 'integer' } }] } } });
  assert.match(flowgen.generate(doc, 'get', '/x/{ids}'),
    /\{ids\} \(array of integer\)/);
});

test('a blank line precedes each commented block but not the url alternates', () => {
  const doc = v2({ '/pet/findByStatus': { get: {
    security: [{ oauth: [] }],
    produces: ['application/json'],
    parameters: [{ name: 'status', in: 'query', type: 'string',
      enum: ['available', 'pending', 'sold'] }]
  } } }, { securityDefinitions: { oauth: { type: 'oauth2' } } });
  const code = flowgen.generate(doc, 'get', '/pet/findByStatus');
  const lines = code.split('\n');
  assert.strictEqual(lines[0], "msg.method = `GET`;");
  assert.match(lines[1], /^msg\.url = /);
  assert.match(lines[2], /^\/\/ msg\.url = /);
  assert.match(lines[3], /^\/\/ msg\.url = /);
  assert.strictEqual(lines[4], '');
  assert.match(lines[5], /^\/\/ Fill in 'authorization' below\./);
  assert.match(lines[6], /^msg\.headers = /);
  assert.ok(!/\n\n\n/.test(code), 'no double blank lines');
});

test('the full example shape matches the requested format', () => {
  const doc = v2({ '/pet/{petId}/uploadImage': { post: {
    security: [{ oauth: [] }],
    consumes: ['multipart/form-data'],
    produces: ['application/json'],
    parameters: [
      { name: 'petId', in: 'path', type: 'integer' },
      { name: 'additionalMetadata', in: 'formData', type: 'string' },
      { name: 'file', in: 'formData', type: 'file' }
    ]
  } } }, { securityDefinitions: { oauth: { type: 'oauth2' } } });
  const code = flowgen.generate(doc, 'post', '/pet/{petId}/uploadImage');
  const blocks = code.split('\n\n');
  assert.strictEqual(blocks.length, 4, 'method | url | headers | payload blocks');
  assert.match(blocks[0], /^msg\.method/);
  assert.match(blocks[1], /^\/\/ Replace \{petId\} \(integer\)/);
  assert.match(blocks[2], /^\/\/ Fill in 'authorization'/);
  assert.match(blocks[3], /^\/\/ Set FILE_CONTENTS/);
  assert.match(blocks[3], /return msg;$/);
});

test('deprecated operations are hidden from the list', () => {
  const doc = v3({
    '/pet/findByTags': { get: { deprecated: true } },
    '/pet/findByStatus': { get: {} }
  });
  const list = flowgen.listOperations(doc);
  assert.strictEqual(list.count, 1);
  assert.deepStrictEqual(list.operations.map(o => o.path), ['/pet/findByStatus']);
});

test('deprecated operations cannot be generated and are not offered', () => {
  const doc = v3({
    '/pet/findByTags': { get: { deprecated: true } },
    '/other': { get: {} }
  });
  assert.throws(() => flowgen.generate(doc, 'get', '/pet/findByTags'), err => {
    assert.match(err.message, /not found/);
    assert.ok(!/findByTags/.test(err.message.split('available:')[1]),
      'the available list must not offer deprecated operations');
    return true;
  });
});

test('the petstore list order matches the document order like Swagger UI', async () => {
  const doc = flowgen.parseDocument(await specs.spec('v2'));
  const list = flowgen.listOperations(doc);
  const docOrder = [];
  for (const p of Object.keys(doc.paths)) {
    for (const m of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']) {
      const op = doc.paths[p][m];
      if (op && !op.deprecated) docOrder.push(m + ' ' + p);
    }
  }
  assert.deepStrictEqual(list.operations.map(o => o.method + ' ' + o.path), docOrder);
  assert.ok(!list.operations.some(o => o.path === '/pet/findByTags'),
    'findByTags is deprecated in the petstore and must be hidden');
});
