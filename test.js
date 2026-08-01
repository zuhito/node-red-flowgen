'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const flowgen = require('./flowgen');

const SPECS = {
  v2: path.join(__dirname, 'spec', 'petstore-v2.yaml'),
  v3: path.join(__dirname, 'spec', 'petstore-v3.yaml')
};


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
    "msg.method = 'GET';",
    "msg.url = 'https://api.test/v1/x';",
    'return msg;'
  ].join('\n'));
});

test('target accepts path with or without leading slash, method is case insensitive', () => {
  const doc = v3({ '/x': { get: {} } });
  assert.strictEqual(flowgen.generate(doc, 'GET', '/x'), flowgen.generate(doc, 'get', 'x'));
});

test('comment carries the description only', () => {
  const doc = v3({ '/x': { get: { summary: 'S', description: 'line one\n\nline two' } } });
  assert.deepStrictEqual(comments(flowgen.generate(doc, 'get', '/x')), ['line one', 'line two']);
  const noDesc = v3({ '/x': { get: { summary: 'S' } } });
  assert.deepStrictEqual(comments(flowgen.generate(noDesc, 'get', '/x')), []);
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
    'https://api.test/v1/x?a=&b=&shared=');
});

test('duplicate parameters keep the operation level one', () => {
  const doc = v3({
    '/x': {
      parameters: [{ name: 'a', in: 'query', description: 'item' }],
      get: { parameters: [{ name: 'a', in: 'query', description: 'op' }] }
    }
  });
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?a=');
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
  assert.strictEqual(run(flowgen.generate(doc, 'get', '/x')).url, 'https://api.test/v1/x?page=');
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
  assert.strictEqual(msg.url, 'https://api.test/v1/x?key=');

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

test('swagger 2.0 formData parameters become the payload', () => {
  const doc = v2({ '/x': { post: {
    consumes: ['multipart/form-data'],
    parameters: [{ name: 'file', in: 'formData', type: 'file' },
                 { name: 'note', in: 'formData', type: 'string' }]
  } } });
  const msg = run(flowgen.generate(doc, 'post', '/x'));
  assert.deepStrictEqual(msg.payload, { file: '', note: '' });
  assert.strictEqual(msg.headers['content-type'], 'multipart/form-data');
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
  assert.strictEqual(run(flowgen.generate(build([{ qry: [] }]), 'get', '/x')).url, 'https://api.test/v1/x?k=');
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
  const doc = v3({ "/it's": { get: { description: "a'b\\c" } } });
  const code = flowgen.generate(doc, 'get', "/it's");
  assert.strictEqual(run(code).url, "https://api.test/v1/it's");
  assert.deepStrictEqual(comments(code), ["a'b\\c"]);
});

for (const [label, file] of Object.entries(SPECS)) {
  test('petstore ' + label + ': every operation compiles to a usable msg', () => {
    const doc = flowgen.parseDocument(fs.readFileSync(file, 'utf8'));
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

  test('petstore ' + label + ': every operation builds a valid flow', () => {
    const doc = flowgen.parseDocument(fs.readFileSync(file, 'utf8'));
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

test('petstore v3 known operation', () => {
  const doc = flowgen.parseDocument(fs.readFileSync(SPECS.v3, 'utf8'));
  const msg = run(flowgen.generate(doc, 'get', '/pet/{petId}'));
  assert.strictEqual(msg.url, 'https://petstore3.swagger.io/api/v3/pet/{petId}');
  assert.strictEqual(msg.headers.api_key, '');
  assert.strictEqual(msg.headers.accept, 'application/json');
});

test('petstore v2 known operation', () => {
  const doc = flowgen.parseDocument(fs.readFileSync(SPECS.v2, 'utf8'));
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
