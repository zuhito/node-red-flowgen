(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('js-yaml'));
  } else {
    root.flowgen = factory(root.jsyaml);
  }
}(typeof self !== 'undefined' ? self : this, function (yaml) {
'use strict';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const BODYLESS = new Set(['get', 'head']);

function parseDocument(text) {
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return JSON.parse(head);
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object') throw new Error('failed to parse document');
  return doc;
}

function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text || '').trim());
}

function detectFormat(doc) {
  if (typeof doc.swagger === 'string' && doc.swagger.startsWith('2.')) return 'swagger2';
  if (typeof doc.openapi === 'string' && doc.openapi.startsWith('3.')) return 'openapi3';
  throw new Error('unknown format: expected swagger 2.x or openapi 3.x');
}

function generate(doc, method, target) {
  const format = detectFormat(doc);
  if (format === 'swagger2') return generateSwagger2(doc, method, target);
  return generateOpenApi3(doc, method, target);
}

function quote(value) {
  return "'" + String(value)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";
}

function literal(value, indent) {
  indent = indent || 0;
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return '[\n' + value.map(v => inner + literal(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return '{\n' + keys.map(k => inner + quote(k) + ': ' + literal(value[k], indent + 1)).join(',\n') + '\n' + pad + '}';
  }
  if (typeof value === 'string') return quote(value);
  return String(value);
}

function pairsLiteral(list) {
  return literal(list.reduce((acc, entry) => (acc[entry[0]] = entry[1], acc), {}), 0);
}

function dedupeHeaders(headers) {
  const out = [];
  for (const entry of headers) {
    const at = out.findIndex(h => h[0].toLowerCase() === entry[0].toLowerCase());
    if (at === -1) out.push(entry); else out[at] = [out[at][0], entry[1]];
  }
  return out;
}

function valuesFor(schema, param) {
  const out = [];
  const push = value => {
    if (value === null || value === undefined || typeof value === 'object') return;
    const text = String(value);
    if (text !== '' && out.indexOf(text) === -1) out.push(text);
  };
  const source = schema || {};
  if (Array.isArray(source.enum)) source.enum.forEach(push);
  if (Array.isArray(source.items && source.items.enum)) source.items.enum.forEach(push);
  push(source.example);
  push(source.default);
  if (param) {
    push(param.example);
    if (param.examples) {
      for (const key of Object.keys(param.examples)) {
        const entry = param.examples[key];
        if (entry && typeof entry === 'object') push(entry.value);
      }
    }
  }
  return out;
}

function renderUrl(base, path, params, choice) {
  let rendered = path;
  for (const param of params) {
    if (param.in !== 'path') continue;
    const value = choice[param.name];
    if (value !== undefined) {
      rendered = rendered.split('{' + param.name + '}').join(encodeURIComponent(value));
    }
  }
  const query = params.filter(p => p.in === 'query').map(function (param, i) {
    const value = choice[param.name];
    return (i ? '&' : '?') + param.name + '=' +
      (value === undefined ? '' : encodeURIComponent(value));
  }).join('');
  return base + rendered + query;
}

function unresolved(path, params) {
  return params.filter(p => p.in === 'path' && !p.values.length)
    .map(p => p.name)
    .filter(name => path.indexOf('{' + name + '}') !== -1)
    .concat((String(path).match(/\{[^}]+\}/g) || [])
      .map(token => token.slice(1, -1))
      .filter(name => !params.some(p => p.name === name)))
    .filter((name, i, all) => all.indexOf(name) === i);
}

function urlLines(base, path, params) {
  const primary = {};
  for (const param of params) {
    if (param.values.length) primary[param.name] = param.values[0];
  }
  const urls = [renderUrl(base, path, params, primary)];
  for (const param of params) {
    for (let i = 1; i < param.values.length; i++) {
      const choice = Object.assign({}, primary);
      choice[param.name] = param.values[i];
      const url = renderUrl(base, path, params, choice);
      if (urls.indexOf(url) === -1) urls.push(url);
    }
  }
  return urls;
}

function listPhrase(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function blanks(pairs) {
  return pairs.filter(entry => String(entry[1]) === '' || /\s$/.test(String(entry[1])))
    .map(entry => entry[0]);
}

function assemble(parts) {
  const lines = [];
  lines.push('msg.method = ' + quote(parts.method.toUpperCase()) + ';');

  if (parts.todo.length) {
    lines.push('// Replace ' + listPhrase(parts.todo.map(name => '{' + name + '}')) +
      ' in the URL below with ' + (parts.todo.length === 1 ? 'a real value' : 'real values') + '.');
  }
  parts.urls.forEach(function (url, i) {
    lines.push((i ? '// ' : '') + 'msg.url = ' + quote(url) + ';');
  });

  if (parts.headers.length) {
    const empty = blanks(parts.headers);
    if (empty.length) {
      lines.push('// Fill in ' + listPhrase(empty.map(quote)) + ' below.');
    }
    lines.push('msg.headers = ' + pairsLiteral(parts.headers) + ';');
  }
  if (parts.cookies.length) {
    const empty = blanks(parts.cookies);
    if (empty.length) {
      lines.push('// Fill in ' + listPhrase(empty.map(quote)) + ' below.');
    }
    lines.push('msg.cookies = ' + pairsLiteral(parts.cookies) + ';');
  }
  if (parts.hasBody) {
    lines.push('// Adjust the request body below to suit the call.');
    lines.push('msg.payload = ' + literal(parts.payload, 0) + ';');
  }
  lines.push('return msg;');
  return lines.join('\n');
}

function notFound(method, target, available) {
  return new Error('not found: ' + method + ' ' + target +
    '\navailable:\n  ' + available.join('\n  '));
}

function generateOpenApi3(doc, rawMethod, target) {
  const method = String(rawMethod).toLowerCase();
  if (!METHODS.includes(method)) throw new Error('unsupported method: ' + rawMethod);

  const resolve = (node, seen) => {
    seen = seen || new Set();
    while (node && typeof node === 'object' && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (!ref.startsWith('#/') || seen.has(ref)) return {};
      seen.add(ref);
      node = ref.slice(2).split('/').reduce(
        (acc, key) => (acc == null ? acc : acc[key.replace(/~1/g, '/').replace(/~0/g, '~')]), doc);
    }
    return node || {};
  };

  const paths = doc.paths || {};
  const available = [];
  const wanted = String(target).replace(/^\//, '');
  let found = null;
  for (const rawPath of Object.keys(paths)) {
    const item = resolve(paths[rawPath]);
    for (const m of METHODS) if (item[m]) available.push(m + ' ' + rawPath);
    if (item[method] && rawPath.replace(/^\//, '') === wanted) {
      found = { path: rawPath, item: item, op: item[method] };
    }
  }
  if (!found) throw notFound(method, target, available);
  const path = found.path, item = found.item, op = found.op;

  const params = [];
  for (const raw of [].concat(op.parameters || [], item.parameters || [])) {
    const p = resolve(raw);
    if (p.name && p.in && !params.some(q => q.name === p.name && q.in === p.in)) params.push(p);
  }

  const servers = op.servers || item.servers || doc.servers || [];
  let base = '';
  if (servers[0] && servers[0].url) {
    const vars = servers[0].variables || {};
    base = String(servers[0].url).replace(/\{(\w+)\}/g, (whole, key) => {
      const v = vars[key];
      if (!v) return whole;
      if (v.default !== undefined) return v.default;
      if (Array.isArray(v.enum) && v.enum.length) return v.enum[0];
      return whole;
    }).replace(/\/$/, '');
  }

  const headers = [];
  const cookies = [];
  const urlParams = params.filter(p => p.in === 'path' || p.in === 'query').map(p => ({
    name: p.name,
    in: p.in,
    values: valuesFor(resolve(p.schema || {}), p)
  }));
  for (const p of params.filter(p => p.in === 'header')) headers.push([p.name, '']);
  for (const p of params.filter(p => p.in === 'cookie')) cookies.push([p.name, '']);

  const requirements = op.security !== undefined ? op.security : (doc.security || []);
  const requirement = requirements.find(r => r && Object.keys(r).length) || null;
  if (requirement) {
    const schemes = (doc.components || {}).securitySchemes || {};
    for (const name of Object.keys(requirement)) {
      const scheme = resolve(schemes[name] || {});
      const type = String(scheme.type || '').toLowerCase();
      if (type === 'apikey') {
        if (scheme.in === 'header') headers.push([scheme.name, '']);
        else if (scheme.in === 'query') urlParams.push({ name: scheme.name, in: 'query', values: [] });
        else if (scheme.in === 'cookie') cookies.push([scheme.name, '']);
      } else if (type === 'http') {
        const s = String(scheme.scheme || '').toLowerCase();
        headers.push(['authorization',
          s === 'basic' ? 'Basic ' : s === 'bearer' ? 'Bearer ' :
            s ? s[0].toUpperCase() + s.slice(1) + ' ' : '']);
      } else if (type === 'oauth2' || type === 'openidconnect') {
        headers.push(['authorization', 'Bearer ']);
      }
    }
  }

  const sample = (schema, depth, seen) => {
    depth = depth || 0;
    seen = seen || new Set();
    if (depth > 6) return null;
    if (schema && typeof schema.$ref === 'string') {
      if (seen.has(schema.$ref)) return null;
      seen = new Set(seen).add(schema.$ref);
    }
    const s = resolve(schema);
    if (!s || typeof s !== 'object') return null;
    if (s.example !== undefined) return s.example;
    if (s.default !== undefined) return s.default;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    if (Array.isArray(s.allOf)) {
      const merged = {};
      for (const part of s.allOf) Object.assign(merged, sample(part, depth, seen) || {});
      return merged;
    }
    const alt = s.oneOf || s.anyOf;
    if (Array.isArray(alt) && alt.length) return sample(alt[0], depth, seen);
    const type = Array.isArray(s.type) ? s.type[0] : s.type;
    if (type === 'array' || s.items) return [sample(s.items || {}, depth + 1, seen)];
    if (type === 'object' || s.properties) {
      const out = {};
      for (const key of Object.keys(s.properties || {})) out[key] = sample(s.properties[key], depth + 1, seen);
      return out;
    }
    if (type === 'integer' || type === 'number') return 0;
    if (type === 'boolean') return false;
    if (type === 'null') return null;
    return '';
  };

  const content = resolve(op.requestBody || {}).content || {};
  const types = Object.keys(content);
  const hasBody = Boolean(op.requestBody) && !BODYLESS.has(method);
  const contentType = hasBody && types.length
    ? (types.find(t => /^application\/(\w+\+)?json$/.test(t)) || types[0]) : null;
  let payload = {};
  if (hasBody) {
    if (contentType) headers.push(['content-type', contentType]);
    const media = resolve(content[contentType] || {});
    const exampleKeys = media.examples ? Object.keys(media.examples) : [];
    if (media.example !== undefined) payload = media.example;
    else if (exampleKeys.length) payload = resolve(media.examples[exampleKeys[0]]).value;
    else if (/^text\//.test(contentType || '') || /octet-stream/.test(contentType || '')) payload = '';
    else {
      const value = sample(media.schema || {});
      payload = value === null || value === undefined ? {} : value;
    }
  }

  const responses = op.responses || {};
  const codes = Object.keys(responses);
  for (const code of codes.filter(c => /^2/.test(c)).concat(codes.filter(c => !/^2/.test(c)))) {
    const rTypes = Object.keys(resolve(responses[code]).content || {});
    if (rTypes.length) {
      headers.push(['accept', rTypes.find(t => /^application\/(\w+\+)?json$/.test(t)) || rTypes[0]]);
      break;
    }
  }

  return assemble({
    method: method,
    urls: urlLines(base, path, urlParams),
    todo: unresolved(path, urlParams),
    headers: dedupeHeaders(headers),
    cookies: cookies,
    hasBody: hasBody,
    payload: payload
  });
}

function generateSwagger2(doc, rawMethod, target) {
  const method = String(rawMethod).toLowerCase();
  if (!METHODS.includes(method)) throw new Error('unsupported method: ' + rawMethod);

  const resolve = (node, seen) => {
    seen = seen || new Set();
    while (node && typeof node === 'object' && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (!ref.startsWith('#/') || seen.has(ref)) return {};
      seen.add(ref);
      node = ref.slice(2).split('/').reduce(
        (acc, key) => (acc == null ? acc : acc[key.replace(/~1/g, '/').replace(/~0/g, '~')]), doc);
    }
    return node || {};
  };

  const paths = doc.paths || {};
  const available = [];
  const wanted = String(target).replace(/^\//, '');
  let found = null;
  for (const rawPath of Object.keys(paths)) {
    const item = resolve(paths[rawPath]);
    for (const m of METHODS) if (item[m]) available.push(m + ' ' + rawPath);
    if (item[method] && rawPath.replace(/^\//, '') === wanted) {
      found = { path: rawPath, item: item, op: item[method] };
    }
  }
  if (!found) throw notFound(method, target, available);
  const path = found.path, item = found.item, op = found.op;

  const params = [];
  for (const raw of [].concat(op.parameters || [], item.parameters || [])) {
    const p = resolve(raw);
    if (p.name && p.in && !params.some(q => q.name === p.name && q.in === p.in)) params.push(p);
  }

  const protocol = (op.schemes || doc.schemes || [])[0] || 'https';
  const base = doc.host
    ? protocol + '://' + doc.host + String(doc.basePath || '').replace(/\/$/, '')
    : String(doc.basePath || '').replace(/\/$/, '');

  const headers = [];
  const urlParams = params.filter(p => p.in === 'path' || p.in === 'query').map(p => ({
    name: p.name,
    in: p.in,
    values: valuesFor(p, p)
  }));
  for (const p of params.filter(p => p.in === 'header')) headers.push([p.name, '']);

  const requirements = op.security !== undefined ? op.security : (doc.security || []);
  const requirement = requirements.find(r => r && Object.keys(r).length) || null;
  if (requirement) {
    const defs = doc.securityDefinitions || {};
    for (const name of Object.keys(requirement)) {
      const def = resolve(defs[name] || {});
      const type = String(def.type || '').toLowerCase();
      if (type === 'apikey') {
        if (def.in === 'header') headers.push([def.name, '']);
        else if (def.in === 'query') urlParams.push({ name: def.name, in: 'query', values: [] });
      } else if (type === 'basic') {
        headers.push(['authorization', 'Basic ']);
      } else if (type === 'oauth2') {
        headers.push(['authorization', 'Bearer ']);
      }
    }
  }

  const sample = (schema, depth, seen) => {
    depth = depth || 0;
    seen = seen || new Set();
    if (depth > 6) return null;
    if (schema && typeof schema.$ref === 'string') {
      if (seen.has(schema.$ref)) return null;
      seen = new Set(seen).add(schema.$ref);
    }
    const s = resolve(schema);
    if (!s || typeof s !== 'object') return null;
    if (s.example !== undefined) return s.example;
    if (s.default !== undefined) return s.default;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    if (Array.isArray(s.allOf)) {
      const merged = {};
      for (const part of s.allOf) Object.assign(merged, sample(part, depth, seen) || {});
      return merged;
    }
    if (s.type === 'array' || s.items) return [sample(s.items || {}, depth + 1, seen)];
    if (s.type === 'object' || s.properties) {
      const out = {};
      for (const key of Object.keys(s.properties || {})) out[key] = sample(s.properties[key], depth + 1, seen);
      return out;
    }
    if (s.type === 'integer' || s.type === 'number') return 0;
    if (s.type === 'boolean') return false;
    return '';
  };

  const bodyParam = params.find(p => p.in === 'body');
  const formParams = params.filter(p => p.in === 'formData');
  const consumes = op.consumes || doc.consumes || [];
  const produces = op.produces || doc.produces || [];
  const hasBody = Boolean(bodyParam || formParams.length) && !BODYLESS.has(method);

  let payload = {};
  if (hasBody) {
    const contentType = consumes.find(t => /^application\/(\w+\+)?json$/.test(t)) || consumes[0] ||
      (formParams.length ? 'application/x-www-form-urlencoded' : 'application/json');
    headers.push(['content-type', contentType]);
    if (bodyParam) {
      if (/^text\//.test(contentType) || /octet-stream/.test(contentType)) payload = '';
      else {
        const value = sample(bodyParam.schema || {});
        payload = value === null || value === undefined ? {} : value;
      }
    } else {
      payload = formParams.reduce((acc, p) => (acc[p.name] = sample(p), acc), {});
    }
  }

  const accept = produces.find(t => /^application\/(\w+\+)?json$/.test(t)) || produces[0];
  if (accept) headers.push(['accept', accept]);

  return assemble({
    method: method,
    urls: urlLines(base, path, urlParams),
    todo: unresolved(path, urlParams),
    headers: dedupeHeaders(headers),
    cookies: [],
    hasBody: hasBody,
    payload: payload
  });
}

function buildFlow(doc, method, target, options) {
  const code = generate(doc, method, target);
  const withTab = !options || options.tab !== false;
  const tab = withTab ? 'flowgen-tab' : undefined;
  const nodes = [
    {
      id: tab, type: 'tab', label: String(method).toUpperCase() + ' ' + target,
      disabled: false, info: '', env: []
    },
    {
      id: 'flowgen-inject', type: 'inject', z: tab, name: '',
      props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }],
      repeat: '', crontab: '', once: false, onceDelay: 0.1,
      topic: '', payload: '', payloadType: 'date',
      x: 160, y: 100, wires: [['flowgen-function']]
    },
    {
      id: 'flowgen-function', type: 'function', z: tab,
      name: String(method).toUpperCase() + ' ' + target,
      func: code, outputs: 1, timeout: 0, noerr: 0,
      initialize: '', finalize: '', libs: [],
      x: 360, y: 100, wires: [['flowgen-request']]
    },
    {
      id: 'flowgen-request', type: 'http request', z: tab, name: '',
      method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '',
      persist: false, proxy: '', insecureHTTPParser: false,
      authType: '', senderr: false, headers: [],
      x: 570, y: 100, wires: [['flowgen-debug']]
    },
    {
      id: 'flowgen-debug', type: 'debug', z: tab, name: '',
      active: true, tosidebar: true, console: false, tostatus: false,
      complete: 'payload', targetType: 'msg', statusVal: '', statusType: 'auto',
      x: 750, y: 100, wires: []
    }
  ];
  if (withTab) { return nodes; }
  return nodes.slice(1).map(function (node) {
    const copy = Object.assign({}, node);
    delete copy.z;
    return copy;
  });
}

function listOperations(doc) {
  const format = detectFormat(doc);
  const resolve = node => {
    const seen = new Set();
    while (node && typeof node === 'object' && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (!ref.startsWith('#/') || seen.has(ref)) return {};
      seen.add(ref);
      node = ref.slice(2).split('/').reduce(
        (acc, key) => (acc == null ? acc : acc[key.replace(/~1/g, '/').replace(/~0/g, '~')]), doc);
    }
    return node || {};
  };

  const operations = [];
  for (const path of Object.keys(doc.paths || {})) {
    const item = resolve(doc.paths[path]);
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      operations.push({ method: method, path: path, summary: op.summary || null });
    }
  }
  return { format: format, count: operations.length, operations: operations };
}

function formatList(result) {
  const rows = result.operations.map(op => ({
    args: op.method + ' ' + op.path,
    note: op.summary || ''
  }));
  const width = rows.reduce((max, r) => Math.max(max, r.args.length), 0);
  return rows.map(r => r.args + ' '.repeat(width - r.args.length) + (r.note ? '  # ' + r.note : '')).join('\n');
}

return {
  parseDocument, detectFormat, generate, generateOpenApi3, generateSwagger2,
  listOperations, buildFlow, formatList, isUrl
};
}));

if (typeof module === 'object' && module.exports && require.main === module) {
  const fs = require('fs');
  const {
    parseDocument, generate, listOperations, buildFlow, formatList, isUrl
  } = module.exports;

  const read = source => new Promise((resolve, reject) => {
    if (!isUrl(source)) { return resolve(fs.readFileSync(source, 'utf8')); }
    const get = (url, redirects) => {
      require(url.startsWith('https:') ? 'https' : 'http').get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects <= 0) { return reject(new Error('too many redirects')); }
          res.resume();
          return get(new URL(res.headers.location, url).toString(), redirects - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }).on('error', reject);
    };
    get(String(source).trim(), 5);
  });
  const args = process.argv.slice(2);
  const listMode = args.some(a => a === '--list' || a === '-l');
  const flowMode = args.some(a => a === '--flow' || a === '-f');
  const positional = args.filter(a => !/^(--list|-l|--flow|-f)$/.test(a));
  const file = positional[0], method = positional[1], target = positional[2];
  if (!file) {
    process.stderr.write(
      'usage:\n' +
      '  node flowgen.js <spec.json|spec.yaml|url> --list\n' +
      '  node flowgen.js <spec.json|spec.yaml|url> <method> <path>\n' +
      '  node flowgen.js <spec.json|spec.yaml|url> <method> <path> --flow\n' +
      'example:\n' +
      '  node flowgen.js petstore.yaml --list\n' +
      '  node flowgen.js petstore.yaml post /pet\n' +
      '  node flowgen.js petstore.yaml get /pet/{petId} --flow\n' +
      '  node flowgen.js https://petstore.swagger.io/v2/swagger.json --list\n');
    process.exit(1);
  }
  read(file).then(text => {
    const doc = parseDocument(text);
    if (listMode || !method) {
      process.stdout.write(formatList(listOperations(doc)) + '\n');
    } else if (flowMode) {
      process.stdout.write(JSON.stringify(buildFlow(doc, method, target), null, 2) + '\n');
    } else {
      process.stdout.write(generate(doc, method, target) + '\n');
    }
  }).catch(err => {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  });
}
