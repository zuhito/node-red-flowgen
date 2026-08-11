#!/usr/bin/env node
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
const SAMPLE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR42mNgAAAAAgAB5Sfe/AAAAABJRU5ErkJggg==';
const USER_PARAM = /^(user|username|userid|user_id|login)$/i;
const PASSWD_PARAM = /^(passwd|password|pass|pwd)$/i;
const GLYPH = {
    ' ': 3, '!': 4, '"': 5, '#': 8, '$': 8, '%': 12, '&': 9, "'": 3,
    '(': 5, ')': 5, '*': 5, '+': 8, ',': 4, '-': 5, '.': 4, '/': 4,
    '0': 8, '1': 8, '2': 8, '3': 8, '4': 8, '5': 8, '6': 8, '7': 8, '8': 8, '9': 8,
    ':': 4, ';': 4, '<': 8, '=': 8, '>': 8, '?': 8, '@': 14,
    A: 9, B: 9, C: 10, D: 10, E: 9, F: 9, G: 11, H: 10, I: 4, J: 7, K: 9, L: 8, M: 12,
    N: 10, O: 11, P: 9, Q: 11, R: 10, S: 9, T: 9, U: 10, V: 9, W: 13, X: 9, Y: 9, Z: 9,
    '[': 4, '\\': 4, ']': 4, '^': 7, '_': 8, '`': 5,
    a: 8, b: 8, c: 7, d: 8, e: 8, f: 4, g: 8, h: 8, i: 3, j: 3, k: 7, l: 3, m: 12,
    n: 8, o: 8, p: 8, q: 8, r: 5, s: 7, t: 4, u: 8, v: 7, w: 10, x: 7, y: 7, z: 7,
    '{': 5, '|': 4, '}': 5, '~': 8
};
const PADDING_WITH_INPUT = 57;
const PADDING_NO_INPUT = 48;

function quote(value) {
    const text = String(value);
    if (!/\{[^}]+\}/.test(text)) {
        return '"' + text
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
    }
    return '`' + text
        .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
        .replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '`';
}

function literal(value, indent, schema, resolve) {
    indent = indent || 0;
    const pad = '    '.repeat(indent);
    const inner = '    '.repeat(indent + 1);
    if (value === null || value === undefined) return 'null';
    if ((value && typeof value === 'object' && typeof value.__raw === 'string')) return value.__raw;
    if (Array.isArray(value)) {
        if (!value.length) return '[]';
        const items = schema && resolve ? resolve(schema.items || {}) : null;
        return '[\n' + value.map(v => inner + literal(v, indent + 1, items, resolve))
            .join(',\n') + '\n' + pad + ']';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (!keys.length) return '{}';
        const required = schema && Array.isArray(schema.required) && schema.required.length
            ? schema.required : null;
        const properties = (schema && schema.properties) || {};
        const useRequired = required && keys.some(key => required.indexOf(key) !== -1);
        const entries = keys.map(key => {
            const optional = useRequired ? required.indexOf(key) === -1 : false;
            const child = !optional && resolve && properties[key] ? resolve(properties[key]) : null;
            return {
                optional: optional,
                body: inner + '"' + String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"') +
                    '": ' + literal(value[key], indent + 1, child, resolve)
            };
        });
        let lastActive = -1;
        entries.forEach((entry, i) => { if (!entry.optional) lastActive = i; });
        const lines = entries.map((entry, i) => {
            const body = entry.body + (i === lastActive ? '' : ',');
            return entry.optional
                ? body.split('\n').map(line => inner + '// ' + line.slice(inner.length)).join('\n')
                : body;
        });
        return '{\n' + lines.join('\n') + '\n' + pad + '}';
    }
    if (typeof value === 'string') return quote(value);
    return String(value);
}

function typeOf(schema) {
    if (!schema || typeof schema !== 'object') return null;
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (type === 'array') {
        const inner = typeOf(schema.items);
        return inner ? 'array of ' + inner : 'array';
    }
    return type || null;
}

function dedupeHeaders(headers) {
    const out = [];
    for (const entry of headers) {
        const at = out.findIndex(h => h[0].toLowerCase() === entry[0].toLowerCase());
        if (at === -1) out.push(entry); else out[at] = [out[at][0], entry[1]];
    }
    return out;
}

function nodeWidth(label, hasInput) {
    if (!label) return 100;
    let width = 0;
    for (const ch of String(label)) {
        width += GLYPH[ch] === undefined ? 8 : GLYPH[ch];
    }
    const padding = hasInput ? PADDING_WITH_INPUT : PADDING_NO_INPUT;
    return Math.max(100, 20 * Math.ceil((width + padding) / 20));
}

function parseDocument(text) {
    if (/^\s*meta\s*\{/.test(String(text || ''))) {
        return parseCollection([{ path: 'request.bru', text: String(text) }]);
    }
    const head = text.replace(/^\uFEFF/, '').trimStart();
    if (head.startsWith('{') || head.startsWith('[')) return JSON.parse(head);
    const doc = yaml.load(text);
    if (!doc || typeof doc !== 'object') throw new Error('failed to parse document');
    return doc;
}

function parseBru(text) {
    const blocks = {};
    const re = /^([\w:.-]+)\s*\{\s*\n([\s\S]*?)\n\}/gm;
    let m;
    while ((m = re.exec(text))) {
        const name = m[1], body = m[2];
        if (/^body:/.test(name) && name !== 'body:form-urlencoded' && name !== 'body:multipart-form') {
            blocks[name] = body;
            continue;
        }
        const pairs = [];
        for (const line of body.split('\n')) {
            const at = line.indexOf(':');
            if (at === -1) continue;
            const key = line.slice(0, at).trim();
            if (!key || key.startsWith('~')) continue;
            pairs.push([key, line.slice(at + 1).trim()]);
        }
        blocks[name] = pairs;
    }
    return blocks;
}

function normalizeRequest(nameHint, source) {
    const req = { name: nameHint, method: null, url: '', headers: [], hasBody: false,
        multipart: false, payload: {} };
    if (typeof source === 'string') {
        const blocks = parseBru(source);
        if (blocks.meta) {
            const n = blocks.meta.find(p => p[0] === 'name');
            if (n) req.name = n[1];
        }
        for (const method of METHODS) {
            if (!blocks[method]) continue;
            req.method = method;
            const u = blocks[method].find(p => p[0] === 'url');
            if (u) req.url = u[1];
        }
        for (const [k, v] of blocks.headers || []) req.headers.push([k, v]);
        if (blocks['auth:bearer']) {
            const t = blocks['auth:bearer'].find(p => p[0] === 'token');
            req.headers.push(['authorization', 'Bearer ' + (t && t[1] ? t[1] : '{token}')]);
        }
        if (blocks['auth:basic']) {
            const pairs = blocks['auth:basic'];
            const value = name => {
                const found = pairs.find(pair => pair[0] === name);
                return found ? found[1] : '';
            };
            req.credentials = brunoCredentials(
                { username: value('username'), password: value('password') }, 'basic');
            req.headers.push(['authorization', { __raw: '`Basic ${credentials}`' }]);
        }
        if (blocks['auth:digest']) {
            const pairs = blocks['auth:digest'];
            const value = name => {
                const found = pairs.find(pair => pair[0] === name);
                return found ? found[1] : '';
            };
            req.credentials = brunoCredentials(
                { username: value('username'), password: value('password') }, 'digest');
        }
        if (blocks['body:json'] !== undefined) {
            req.hasBody = true;
            try { req.payload = JSON.parse(blocks['body:json']); }
            catch (err) { req.payload = blocks['body:json'].trim(); }
        } else if (blocks['body:text'] !== undefined) {
            req.hasBody = true;
            req.payload = blocks['body:text'].trim();
        } else if (blocks['body:form-urlencoded']) {
            req.hasBody = true;
            req.payload = {};
            for (const [k, v] of blocks['body:form-urlencoded']) req.payload[k] = v;
        } else if (blocks['body:multipart-form']) {
            req.hasBody = true;
            req.multipart = true;
            req.payload = {};
            for (const [k, v] of blocks['body:multipart-form']) {
                req.payload[k] = /^@file\(/.test(v)
                    ? { value: { __raw: 'FILE_CONTENTS' }, options: { filename: v.replace(/^@file\(|\)$/g, '') || { __raw: 'FILENAME' } } }
                    : v;
            }
        }
    } else if (source && typeof source === 'object') {
        const http = source.http || source.request || source;
        if (source.info && source.info.name) req.name = source.info.name;
        if (source.name) req.name = source.name;
        req.method = String(http.method || 'get').toLowerCase();
        req.url = http.url || '';
        let headers = source.headers || http.headers || [];
        if (!Array.isArray(headers)) headers = Object.keys(headers).map(k => ({ name: k, value: headers[k] }));
        for (const h of headers) {
            if (h && h.enabled === false) continue;
            req.headers.push([h.name || h.key, h.value === undefined ? '' : String(h.value)]);
        }
        const auth = source.auth || http.auth || http.authDetails || null;
        if (auth && typeof auth === 'object') {
            const kind = String(auth.type || auth.mode || '').toLowerCase();
            if (auth.bearer || kind === 'bearer') {
                const token = (auth.bearer && auth.bearer.token) || auth.token || '';
                req.headers.push(['authorization', 'Bearer ' + (token || '{token}')]);
            } else if (auth.basic || kind === 'basic') {
                const entry = auth.basic || auth;
                req.credentials = brunoCredentials(entry, 'basic');
                req.headers.push(['authorization', { __raw: '`Basic ${credentials}`' }]);
            } else if (auth.digest || kind === 'digest') {
                const entry = auth.digest || auth;
                req.credentials = brunoCredentials(entry, 'digest');
            } else if (auth.apikey || kind === 'apikey' || kind === 'api-key') {
                const entry = auth.apikey || auth;
                const name = entry.key || entry.name || 'api-key';
                if (String(entry.placement || 'header').toLowerCase() === 'header') {
                    req.headers.push([name, String(entry.value || '')]);
                }
            }
        }
        const body = source.body || http.body || null;
        if (body && typeof body === 'object') {
            const mode = body.type || body.mode;
            const data = body.data !== undefined ? body.data : body[mode];
            const declareType = value => {
                if (req.headers.some(h => String(h[0]).toLowerCase() === 'content-type')) return;
                req.headers.push(['content-type', value]);
            };
            if (mode === 'json') {
                req.hasBody = true;
                declareType('application/json');
                if (typeof data === 'string') { try { req.payload = JSON.parse(data); } catch (err) { req.payload = data; } }
                else req.payload = data === undefined ? {} : data;
            } else if (mode === 'text') {
                req.hasBody = true;
                declareType('text/plain');
                req.payload = String(data || '');
            }
            else if (mode === 'formUrlEncoded' || mode === 'form-urlencoded') {
                req.hasBody = true; declareType('application/x-www-form-urlencoded');
                req.payload = {};
                for (const e of data || []) if (e.enabled !== false) req.payload[e.name] = e.value || '';
            } else if (mode === 'multipartForm' || mode === 'multipart-form') {
                req.hasBody = true; req.multipart = true; req.payload = {};
                for (const e of data || []) {
                    if (e.enabled === false) continue;
                    req.payload[e.name] = e.type === 'file'
                        ? { value: { __raw: 'FILE_CONTENTS' }, options: { filename: { __raw: 'FILENAME' } } }
                        : (e.value || '');
                }
            }
        }
    }
    return req.method && req.url ? req : null;
}

function parseCollection(files) {
    const requests = [];
    const vars = {};
    for (const file of files) {
        const rel = String(file.path || '').replace(/\\/g, '/');
        const base = rel.split('/').pop();
        if (/^opencollection\.ya?ml$|^bruno\.json$|^collection\.bru$/.test(base)) {
            if (/\.bru$/.test(base)) {
                for (const [k, v] of parseBru(file.text).vars || []) vars[k] = vars[k] === undefined ? v : vars[k];
            }
            continue;
        }
        if (/(^|\/)environments\//.test(rel)) {
            let pairs = [];
            if (/\.bru$/.test(base)) pairs = parseBru(file.text).vars || [];
            else {
                try {
                    const env = yaml.load(file.text) || {};
                    const list = env.vars || env.variables || [];
                    pairs = Array.isArray(list) ? list.map(e => [e.name, e.value]) :
                        Object.keys(list).map(k => [k, list[k]]);
                } catch (err) { pairs = []; }
            }
            for (const [k, v] of pairs) if (vars[k] === undefined) vars[k] = v;
            continue;
        }
        let req = null;
        if (/\.bru$/.test(base)) req = normalizeRequest(base.replace(/\.bru$/, ''), file.text);
        else if (/\.(ya?ml|json)$/.test(base)) {
            let doc = null;
            try { doc = /\.json$/.test(base) ? JSON.parse(file.text) : yaml.load(file.text); } catch (err) { doc = null; }
            if (doc && (doc.http || doc.request)) {
                req = normalizeRequest(base.replace(/\.(ya?ml|json)$/, ''), doc);
            } else if (doc && Array.isArray(doc.items)) {
                const walk = items => {
                    for (const item of items || []) {
                        if (Array.isArray(item.items)) { walk(item.items); continue; }
                        const r = normalizeRequest(item.name || '', item);
                        if (r) requests.push(r);
                    }
                };
                walk(doc.items);
            }
        }
        if (req) requests.push(req);
    }
    if (!requests.length) throw new Error('no requests found in the Bruno collection');
    return { bruno: true, vars: vars, requests: requests };
}

function detectFormat(doc) {
    if (doc && doc.bruno === true && Array.isArray(doc.requests)) return 'bruno';
    if (doc && doc.http && doc.http.url) return 'bruno';
    if (doc && Array.isArray(doc.items) &&
            doc.items.some(i => i && (i.request || (i.items || []).some(j => j && j.request)))) return 'bruno';
    if (typeof doc.swagger === 'string' && doc.swagger.startsWith('2.')) return 'swagger2';
    if (typeof doc.openapi === 'string' && doc.openapi.startsWith('3.')) return 'openapi3';
    throw new Error('unknown format: expected swagger 2.x or openapi 3.x');
}

function toBruno(doc) {
    let bruno = null;
    if (doc.bruno === true) bruno = doc;
    else if (doc.http && doc.http.url) {
        const req = normalizeRequest((doc.info && doc.info.name) || 'request', doc);
        if (!req) throw new Error('not a usable Bruno request');
        bruno = { bruno: true, vars: {}, requests: [req] };
    } else {
        bruno = parseCollection([{ path: 'collection.json', text: JSON.stringify(doc) }]);
    }
    const seen = {};
    for (const req of bruno.requests) {
        const vars = bruno.vars;
        const clean = String(req.url)
            .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) =>
                vars && vars[name] !== undefined && String(vars[name]) !== ''
                    ? String(vars[name]) : '{' + name + '}')
            .replace(/(^|\/):([A-Za-z_][\w-]*)/g, '$1{$2}');
        const base = clean.replace(/^https?:\/\/[^/]*/, '').split('?')[0] || '/';
        const id = req.method + ' ' + base;
        seen[id] = (seen[id] || 0) + 1;
        req._path = seen[id] > 1 ? base + '#' + seen[id] : base;
    }
    return bruno;
}

function credentialsFrom(urlParams) {
    const pick = re => (urlParams || []).find(p => p.in === 'path' && re.test(p.name));
    const user = pick(USER_PARAM);
    const passwd = pick(PASSWD_PARAM);
    return {
        user: user ? user.name : 'user',
        userType: user ? user.type : null,
        passwd: passwd ? passwd.name : 'passwd',
        passwdType: passwd ? passwd.type : null
    };
}

function brunoCredentials(entry, scheme) {
    const clean = value => String(value === undefined || value === null ? '' : value).trim();
    const read = (value, fallback) => {
        const text = clean(value);
        if (!text) return { name: fallback, literal: false };
        const stripped = text.replace(/^\{\{|\}\}$/g, '').replace(/^\{|\}$/g, '').trim();
        const isVariable = /^\{\{.*\}\}$/.test(text) || /^\{.*\}$/.test(text);
        return { name: stripped || fallback, literal: !isVariable };
    };
    const user = read(entry.username !== undefined ? entry.username : entry.user, 'user');
    const passwd = read(entry.password !== undefined ? entry.password : entry.passwd, 'passwd');
    return {
        user: user.name, passwd: passwd.name,
        userType: null, passwdType: null,
        known: user.literal && passwd.literal,
        scheme: scheme, realm: clean(entry.realm)
    };
}

function digestOf(doc, method, target) {
    let found = null;
    const seen = credentialsSink;
    credentialsSink = pair => { if (pair && pair.scheme === 'digest') found = pair; };
    try { generate(doc, method, target); } catch (err) { found = null; }
    credentialsSink = seen;
    return found;
}

let credentialsSink = null;

const MD5_SOURCE = [
    "function md5(input) {",
    "    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,",
    "        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,",
    "        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,",
    "        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];",
    "    const K = [];",
    "    for (let i = 0; i < 64; i++) {",
    "        K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);",
    "    }",
    "",
    "    const bytes = [];",
    "    for (let i = 0; i < input.length; i++) {",
    "        const code = input.charCodeAt(i);",
    "        if (code < 128) { bytes.push(code); }",
    "        else if (code < 2048) {",
    "            bytes.push(192 | (code >> 6), 128 | (code & 63));",
    "        } else {",
    "            bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));",
    "        }",
    "    }",
    "",
    "    const bitLength = bytes.length * 8;",
    "    bytes.push(128);",
    "    while (bytes.length % 64 !== 56) { bytes.push(0); }",
    "    for (let i = 0; i < 8; i++) {",
    "        bytes.push((i < 4 ? (bitLength >>> (8 * i)) : 0) & 255);",
    "    }",
    "",
    "    let a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;",
    "    const rotate = (value, count) => (value << count) | (value >>> (32 - count));",
    "",
    "    for (let chunk = 0; chunk < bytes.length; chunk += 64) {",
    "        const M = [];",
    "        for (let i = 0; i < 16; i++) {",
    "            const at = chunk + i * 4;",
    "            M[i] = bytes[at] | (bytes[at + 1] << 8) |",
    "                (bytes[at + 2] << 16) | (bytes[at + 3] << 24);",
    "        }",
    "        let A = a0, B = b0, C = c0, D = d0;",
    "        for (let i = 0; i < 64; i++) {",
    "            let F, g;",
    "            if (i < 16) { F = (B & C) | (~B & D); g = i; }",
    "            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }",
    "            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }",
    "            else { F = C ^ (B | ~D); g = (7 * i) % 16; }",
    "            F = (F + A + K[i] + M[g]) | 0;",
    "            A = D; D = C; C = B;",
    "            B = (B + rotate(F, S[i])) | 0;",
    "        }",
    "        a0 = (a0 + A) | 0; b0 = (b0 + B) | 0;",
    "        c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;",
    "    }",
    "",
    "    return [a0, b0, c0, d0].map(word => {",
    "        let out = '';",
    "        for (let i = 0; i < 4; i++) {",
    "            out += ((word >>> (8 * i)) & 255).toString(16).padStart(2, '0');",
    "        }",
    "        return out;",
    "    }).join('');",
    "}",
].join('\n');

function digestRetryCode(pair, method) {
    const user = pair.known ? JSON.stringify(pair.user) : '`{' + pair.user + '}`';
    const passwd = pair.known ? JSON.stringify(pair.passwd) : '`{' + pair.passwd + '}`';
    return [
        '// MD5 is written out in full rather than taken from crypto. A function',
        '// node has no require, and the libs field only works where',
        '// functionExternalModules is enabled, which many deployments turn off.',
        MD5_SOURCE,
        '',
        'const challenge = String((msg.headers || {})["www-authenticate"] || "");',
        'if (!/^Digest/i.test(challenge)) {',
        '    // Already authenticated, or the server never asked. Pass it through.',
        '    return msg;',
        '}',
        '',
        'const field = name => {',
        '    const quoted = challenge.match(new RegExp(name + \'="([^"]*)"\', "i"));',
        '    if (quoted) { return quoted[1]; }',
        '    const bare = challenge.match(new RegExp(name + "=([^,\\\\s]+)", "i"));',
        '    return bare ? bare[1] : "";',
        '};',
        '',
        'const realm = field("realm");',
        'const nonce = field("nonce");',
        'const opaque = field("opaque");',
        'const qop = (field("qop").split(",")[0] || "").trim();',
        '// RFC 2617 requires nc to increase for a given nonce, and a server that',
        '// keeps one nonce alive will reject a repeated count as a replay. The',
        '// count is therefore kept per nonce in the node\'s own context, so a',
        '// flow that runs more than once still authenticates.',
        'const counters = context.get("digestNonceCounts") || {};',
        'const count = (counters[nonce] || 0) + 1;',
        '// Only the nonce in play is remembered; the rest are spent.',
        'context.set("digestNonceCounts", { [nonce]: count });',
        'const nc = count.toString(16).padStart(8, "0");',
        '',
        '// The client nonce only has to be unpredictable to the server for the',
        '// life of one exchange, so Math.random with a timestamp is adequate',
        '// here. It is not a secret and it is never reused.',
        'const cnonce = (Date.now().toString(16) +',
        '    Math.floor(Math.random() * 0x100000000).toString(16)).slice(-16);',
        'const uri = new URL(msg.url).pathname;',
        '',
        'const ha1 = md5(`${' + user + '}:${realm}:${' + passwd + '}`);',
        'const ha2 = md5(`' + method + ':${uri}`);',
        'const response = qop',
        '    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)',
        '    : md5(`${ha1}:${nonce}:${ha2}`);',
        '',
        'const credentials = [',
        '    `username="${' + user + '}"`,',
        '    `realm="${realm}"`,',
        '    `nonce="${nonce}"`,',
        '    `uri="${uri}"`,',
        '    `response="${response}"`,',
        '    `algorithm=MD5`,',
        '    qop ? `qop=${qop}` : null,',
        '    qop ? `nc=${nc}` : null,',
        '    qop ? `cnonce="${cnonce}"` : null,',
        '    opaque ? `opaque="${opaque}"` : null',
        '].filter(Boolean).join(", ");',
        '',
        '// The challenge came with cookies, and the retry is refused without them.',
        'const setCookie = (msg.headers || {})["set-cookie"];',
        'const cookies = [].concat(setCookie || [])',
        '    .map(entry => String(entry).split(";")[0])',
        '    .filter(Boolean).join("; ");',
        '',
        'msg.headers = Object.assign({}, msg.retryHeaders, {',
        '    "authorization": `Digest ${credentials}`',
        '});',
        'if (cookies) { msg.headers.cookie = cookies; }',
        'msg.method = ' + JSON.stringify(method) + ';',
        'delete msg.payload;',
        'return msg;'
    ].join('\n');
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

function urlLines(base, path, params) {
    if (!/^[a-z]+:\/\//i.test(String(base))) base = '{baseUrl}' + base;
    const render = choice => {
        let rendered = path;
        for (const p of params) {
            if (p.in === 'path' && choice[p.name] !== undefined) {
                rendered = rendered.split('{' + p.name + '}').join(encodeURIComponent(choice[p.name]));
            }
        }
        return base + rendered + params.filter(p => p.in === 'query').map((p, i) =>
            (i ? '&' : '?') + p.name + '=' + (choice[p.name] === undefined
                ? '{' + p.name + '}' : encodeURIComponent(choice[p.name]))).join('');
    };
    const primary = {};
    for (const p of params) if (p.values.length) primary[p.name] = p.values[0];
    const urls = [render(primary)];
    for (const p of params) {
        for (let i = 1; i < p.values.length; i++) {
            const url = render(Object.assign({}, primary, { [p.name]: p.values[i] }));
            if (urls.indexOf(url) === -1) urls.push(url);
        }
    }
    return urls;
}

function unresolved(base, path, params) {
    const items = [];
    if (!/^[a-z]+:\/\//i.test(String(base))) items.push({ name: 'baseUrl', type: null });
    for (const p of params) {
        if (p.values.length) continue;
        if (p.in === 'path' && path.indexOf('{' + p.name + '}') === -1) continue;
        items.push({ name: p.name, type: p.type || null });
    }
    for (const token of String(path).match(/\{[^}]+\}/g) || []) {
        const name = token.slice(1, -1);
        if (!params.some(p => p.name === name)) items.push({ name: name, type: null });
    }
    return items.filter((item, i, all) => all.findIndex(x => x.name === item.name) === i);
}

function assemble(parts) {
    const phrase = names => names.length === 1 ? names[0]
        : names.length === 2 ? names[0] + ' and ' + names[1]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const typed = (label, type) => type ? label + ' (' + type + ')' : label;
    const blank = pairs => {
        const named = [];
        const empty = [];
        for (const entry of pairs) {
            if ((entry[1] && typeof entry[1] === 'object' &&
                typeof entry[1].__raw === 'string')) continue;
            const value = String(entry[1]);
            const holes = value.match(/\{[^}]+\}/g);
            if (holes) {
                for (const hole of holes) {
                    if (!named.some(item => item.text === hole)) {
                        named.push({ text: hole, type: entry[2] });
                    }
                }
            } else if (value === '' || /\s$/.test(value)) {
                empty.push({
                    text: '"' + entry[0].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"',
                    type: entry[2]
                });
            }
        }
        return { named: named, empty: empty };
    };

    const lines = ['msg.method = ' + quote(parts.method.toUpperCase()) + ';'];
    if (parts.todo.length) {
        lines.push('', '// Replace ' +
            phrase(parts.todo.map(item => typed('{' + item.name + '}', item.type))) +
            ' in the URL below with ' + (parts.todo.length === 1 ? 'a real value' : 'real values') + '.');
    }
    parts.urls.forEach((url, i) =>
        lines.push((i ? '// ' : '') + 'msg.url = ' + quote(url) + ';'));
    if (credentialsSink && parts.credentials) { credentialsSink(parts.credentials); }
    if (parts.credentials && parts.credentials.scheme === 'digest') {
        lines.push('');
        lines.push('// Digest auth answers this call with 401 and a challenge. The node');
        lines.push('// after the request reads that challenge and signs the retry, so no');
        lines.push('// credentials are sent here.');
    }
    for (const [key, pairs] of [['headers', parts.headers], ['cookies', parts.cookies]]) {
        if (!pairs.length) continue;
        const empty = blank(pairs);
        lines.push('');
        if (key === 'headers' && parts.credentials) {
            const pair = parts.credentials;
            const names = [{ name: pair.user, type: pair.userType },
                { name: pair.passwd, type: pair.passwdType }];
            if (!pair.known) {
                lines.push('// Replace ' +
                    phrase(names.map(item => typed('{' + item.name + '}', item.type))) +
                    ' below with real values.');
            }
            if (pair.scheme !== 'digest') {
                const secret = pair.known
                    ? pair.user + ':' + pair.passwd
                    : '{' + pair.user + '}:{' + pair.passwd + '}';
                lines.push('/* global Buffer */');
                lines.push('const credentials = Buffer.from(' + quote(secret) +
                    ').toString("base64");');
            }
        }
        if (empty.named.length) {
            lines.push('// Replace ' +
                phrase(empty.named.map(item => typed(item.text, item.type))) +
                ' below with ' +
                (empty.named.length === 1 ? 'a real value' : 'real values') + '.');
        }
        if (empty.empty.length) {
            lines.push('// Fill in ' +
                phrase(empty.empty.map(item => typed(item.text, item.type))) + ' below.');
        }
        lines.push('msg.' + key + ' = ' + literal(pairs.reduce((acc, e) => (acc[e[0]] = e[1], acc), {}), 0) + ';');
    }
    if (parts.hasBody) {
        const uses = name => JSON.stringify(parts.payload || {}).indexOf('"' + name + '"') !== -1 ||
            (function scan(node) {
                if (node && typeof node === 'object' && typeof node.__raw === 'string') {
                    return node.__raw === name;
                }
                if (Array.isArray(node)) return node.some(scan);
                if (node && typeof node === 'object') return Object.keys(node).some(k => scan(node[k]));
                return false;
            })(parts.payload);
        lines.push('');
        if (parts.multipart && uses('FILE_CONTENTS')) {
            lines.push('// Point FILE_CONTENTS at the bytes to upload; a Buffer or a stream both work.');
            lines.push('/* global Buffer */');
            lines.push('const FILE_CONTENTS = Buffer.from(' + quote(SAMPLE_PNG) + ', "base64");');
            if (uses('FILENAME')) lines.push('const FILENAME = "gray1x1.png";');
            lines.push('');
        }
        lines.push(parts.multipart
            ? '// Adjust the other multipart fields below to suit the call.'
            : '// Adjust the request body below to suit the call.');
        lines.push('msg.payload = ' +
            literal(parts.payload, 0, parts.payloadSchema, parts.resolve) + ';');
    } else if (!BODYLESS.has(String(parts.method || '').toLowerCase())) {
        lines.push('');
        lines.push('// This request carries no body, so drop whatever `msg.payload` held.');
        lines.push('delete msg.payload;');
    }
    lines.push('return msg;');
    return lines.join('\n');
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
        for (const m of METHODS) {
            if (item[m] && !item[m].deprecated) available.push(m + ' ' + rawPath);
        }
        if (item[method] && !item[method].deprecated &&
                rawPath.replace(/^\//, '') === wanted) {
            found = { path: rawPath, item: item, op: item[method] };
        }
    }
    if (!found) throw new Error('not found: ' + method + ' ' + target + '\navailable:\n  ' + available.join('\n  '));
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
        type: typeOf(resolve(p.schema || {})),
        values: valuesFor(resolve(p.schema || {}), p)
    }));
    for (const p of params.filter(p => p.in === 'header')) {
        headers.push([p.name, '{' + p.name + '}', typeOf(resolve(p.schema || {}))]);
    }
    for (const p of params.filter(p => p.in === 'cookie')) {
        cookies.push([p.name, '{' + p.name + '}', typeOf(resolve(p.schema || {}))]);
    }

    let credentials = null;
    const requirements = op.security !== undefined ? op.security : (doc.security || []);
    const requirement = requirements.find(r => r && Object.keys(r).length) || null;
    if (requirement) {
        const schemes = (doc.components || {}).securitySchemes || {};
        for (const name of Object.keys(requirement)) {
            const scheme = resolve(schemes[name] || {});
            const type = String(scheme.type || '').toLowerCase();
            if (type === 'apikey') {
                if (scheme.in === 'header') headers.push([scheme.name, '{' + scheme.name + '}']);
                else if (scheme.in === 'query') urlParams.push({ name: scheme.name, in: 'query', values: [] });
                else if (scheme.in === 'cookie') cookies.push([scheme.name, '{' + scheme.name + '}']);
            } else if (type === 'http') {
                const s = String(scheme.scheme || '').toLowerCase();
                if (s === 'basic' || s === 'digest') {
                    credentials = credentialsFrom(urlParams);
                    credentials.scheme = s;
                    if (s === 'digest') {
                        credentials.realm = String(scheme.realm || '');
                    } else {
                        headers.push(['authorization', { __raw: '`Basic ${credentials}`' }]);
                    }
                } else {
                    headers.push(['authorization',
                        s === 'bearer' ? 'Bearer {token}' :
                            s ? s[0].toUpperCase() + s.slice(1) + ' {credentials}'
                                : '{credentials}']);
                }
            } else if (type === 'oauth2' || type === 'openidconnect') {
                headers.push(['authorization', 'Bearer {token}']);
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
    const multipart = /^multipart\//.test(contentType || '');
    let payload = {};
    let payloadSchema = null;
    if (hasBody) {
        if (contentType) headers.push(['content-type', contentType]);
        const media = resolve(content[contentType] || {});
        payloadSchema = media.schema ? resolve(media.schema) : null;
        const exampleKeys = media.examples ? Object.keys(media.examples) : [];
        if (multipart) {
            const multipartSchema = resolve(media.schema || {});
            payload = {};
            const multipartProps = multipartSchema.properties || {};
            for (const key of Object.keys(multipartProps)) {
                const prop = resolve(multipartProps[key]);
                const isFile = prop.format === 'binary' ||
                    (prop.type === 'array' && resolve(prop.items || {}).format === 'binary');
                payload[key] = isFile
                    ? { value: { __raw: 'FILE_CONTENTS' }, options: { filename: { __raw: 'FILENAME' } } }
                    : sample(prop);
            }
        } else if (media.example !== undefined) payload = media.example;
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
        todo: unresolved(base, path, urlParams),
        headers: dedupeHeaders(headers),
        cookies: cookies,
        credentials: credentials,
        hasBody: hasBody,
        multipart: multipart,
        payload: payload,
        payloadSchema: payloadSchema,
        resolve: resolve
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
        for (const m of METHODS) {
            if (item[m] && !item[m].deprecated) available.push(m + ' ' + rawPath);
        }
        if (item[method] && !item[method].deprecated &&
                rawPath.replace(/^\//, '') === wanted) {
            found = { path: rawPath, item: item, op: item[method] };
        }
    }
    if (!found) throw new Error('not found: ' + method + ' ' + target + '\navailable:\n  ' + available.join('\n  '));
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
        type: typeOf(p),
        values: valuesFor(p, p)
    }));
    for (const p of params.filter(p => p.in === 'header')) {
        headers.push([p.name, '{' + p.name + '}', typeOf(p)]);
    }

    const requirements = op.security !== undefined ? op.security : (doc.security || []);
    const requirement = requirements.find(r => r && Object.keys(r).length) || null;
    if (requirement) {
        const defs = doc.securityDefinitions || {};
        for (const name of Object.keys(requirement)) {
            const def = resolve(defs[name] || {});
            const type = String(def.type || '').toLowerCase();
            if (type === 'apikey') {
                if (def.in === 'header') headers.push([def.name, '{' + def.name + '}']);
                else if (def.in === 'query') urlParams.push({ name: def.name, in: 'query', values: [] });
            } else if (type === 'basic') {
                headers.push(['authorization', 'Basic {credentials}']);
            } else if (type === 'oauth2') {
                headers.push(['authorization', 'Bearer {token}']);
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
    let multipart = false;
    let payloadSchema = null;
    if (hasBody) {
        const contentType = consumes.find(t => /^application\/(\w+\+)?json$/.test(t)) || consumes[0] ||
            (formParams.length ? 'application/x-www-form-urlencoded' : 'application/json');
        multipart = /^multipart\//.test(contentType);
        headers.push(['content-type', contentType]);
        if (bodyParam) {
            payloadSchema = bodyParam.schema ? resolve(bodyParam.schema) : null;
            if (/^text\//.test(contentType) || /octet-stream/.test(contentType)) payload = '';
            else {
                const value = sample(bodyParam.schema || {});
                payload = value === null || value === undefined ? {} : value;
            }
        } else if (multipart) {
            payload = formParams.reduce((acc, p) => {
                acc[p.name] = p.type === 'file'
                    ? { value: { __raw: 'FILE_CONTENTS' }, options: { filename: { __raw: 'FILENAME' } } }
                    : sample(p);
                return acc;
            }, {});
            payloadSchema = {
                properties: formParams.reduce((acc, p) => (acc[p.name] = p, acc), {}),
                required: formParams.filter(p => p.required).map(p => p.name)
            };
        } else {
            payload = formParams.reduce((acc, p) => (acc[p.name] = sample(p), acc), {});
            payloadSchema = {
                properties: formParams.reduce((acc, p) => (acc[p.name] = p, acc), {}),
                required: formParams.filter(p => p.required).map(p => p.name)
            };
        }
    }

    const accept = produces.find(t => /^application\/(\w+\+)?json$/.test(t)) || produces[0];
    if (accept) headers.push(['accept', accept]);

    return assemble({
        method: method,
        urls: urlLines(base, path, urlParams),
        todo: unresolved(base, path, urlParams),
        headers: dedupeHeaders(headers),
        cookies: [],
        hasBody: hasBody,
        multipart: multipart,
        payload: payload,
        payloadSchema: payloadSchema,
        resolve: resolve
    });
}

function listOperations(doc) {
    const format = detectFormat(doc);
    if (format === 'bruno') {
        const bruno = toBruno(doc);
        const operations = bruno.requests.map(req => ({
            method: req.method, path: req._path, summary: req.name || null
        }));
        return { format: 'bruno', count: operations.length, operations: operations };
    }
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
            if (!op || op.deprecated) continue;
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

function generate(doc, method, target) {
    const format = detectFormat(doc);
    if (format === 'bruno') {
        const bruno = toBruno(doc);
        const wanted = String(target || '').replace(/^\//, '');
        let found = null;
        const available = [];
        for (const req of bruno.requests) {
            available.push(req.method + ' ' + req._path);
            if (req.method === String(method).toLowerCase() && req._path.replace(/^\//, '') === wanted) {
                found = req;
            }
        }
        if (!found) throw new Error('not found: ' + method + ' ' + target + '\navailable:\n  ' + available.join('\n  '));

        const todo = [];
        const substitute = text => String(text)
            .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) =>
                bruno.vars[name] !== undefined && String(bruno.vars[name]) !== ''
                    ? String(bruno.vars[name]) : '{' + name + '}');
        const substituteDeep = value => {
            if (typeof value === 'string') return substitute(value);
            if (Array.isArray(value)) return value.map(substituteDeep);
            if (value && typeof value === 'object') {
                const out = {};
                for (const key of Object.keys(value)) out[key] = substituteDeep(value[key]);
                return out;
            }
            return value;
        };
        const url = substitute(found.url).replace(/(^|\/):([A-Za-z_][\w-]*)/g, '$1{$2}');
        for (const match of url.matchAll(/(^|[^$])\{([^}]+)\}/g)) {
            const name = match[2];
            if (!todo.some(t => t.name === name)) todo.push({ name: name, type: null });
        }
        const headers = found.headers.map(h =>
            [h[0], (h[1] && typeof h[1] === 'object' && typeof h[1].__raw === 'string') ? h[1] : substitute(h[1])]);
        if (found.credentials) {
            const named = todo.map(t => t.name);
            const pick = re => named.find(name => re.test(name));
            found.credentials.user = pick(USER_PARAM) || found.credentials.user;
            found.credentials.passwd = pick(PASSWD_PARAM) || found.credentials.passwd;
        }
        return assemble({
            method: found.method,
            urls: [url],
            todo: todo,
            headers: dedupeHeaders(headers),
            cookies: [],
            credentials: found.credentials || null,
            hasBody: found.hasBody && !BODYLESS.has(found.method),
            multipart: found.multipart,
            payload: substituteDeep(found.payload)
        });
    }
    if (format === 'swagger2') return generateSwagger2(doc, method, target);
    return generateOpenApi3(doc, method, target);
}

function buildFlow(doc, method, target, options) {
    const code = generate(doc, method, target);
    const withTab = !options || options.tab !== false;
    const tab = withTab ? 'flowgen-tab' : undefined;
    const urlMatch = code.match(/msg\.url = `([^`]*)`/);
    let shown = String(target);
    if (urlMatch) {
        const withoutHost = urlMatch[1].replace(/^[a-z]+:\/\/[^/]*/i, '');
        shown = (withoutHost.split('?')[0]) || String(target);
    }
    const name = String(method).toUpperCase() + ' ' + shown;

    const digest = digestOf(doc, method, target);
    const retryName = digest ? 'sign the digest challenge' : null;
    const labels = digest
        ? [['timestamp', false], [name, true], ['http request', true],
            [retryName, true], ['http request', true], ['msg.payload', true]]
        : [['timestamp', false], [name, true], ['http request', true],
            ['msg.payload', true]];

    const xs = [];
    let left = 60;
    for (const entry of labels) {
        const width = nodeWidth(entry[0], entry[1]);
        const edge = 20 * Math.ceil(left / 20);
        xs.push(edge + width / 2);
        left = edge + width + 40;
    }
    const nodes = [
        {
            id: tab, type: 'tab', label: name,
            disabled: false, info: '', env: []
        },
        {
            id: 'flowgen-inject', type: 'inject', z: tab, name: '',
            props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }],
            repeat: '', crontab: '', once: false, onceDelay: 0.1,
            topic: '', payload: '', payloadType: 'date',
            x: xs[0], y: 100, wires: [['flowgen-function']]
        },
        {
            id: 'flowgen-function', type: 'function', z: tab,
            name: name,
            func: code, outputs: 1, timeout: 0, noerr: 0,
            initialize: '', finalize: '', libs: [],
            x: xs[1], y: 100, wires: [['flowgen-request']]
        },
        {
            id: 'flowgen-request', type: 'http request', z: tab, name: '',
            method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '',
            persist: false, proxy: '', insecureHTTPParser: false,
            authType: '', senderr: digest ? true : false, headers: [],
            x: xs[2], y: 100,
            wires: [[digest ? 'flowgen-digest' : 'flowgen-debug']]
        }
    ];

    if (digest) {
        nodes.push({
            id: 'flowgen-digest', type: 'function', z: tab, name: retryName,
            func: digestRetryCode(digest, String(method).toUpperCase()),
            outputs: 1, timeout: 0, noerr: 0,
            initialize: '', finalize: '',
            libs: [],
            x: xs[3], y: 100, wires: [['flowgen-retry']]
        });
        nodes.push({
            id: 'flowgen-retry', type: 'http request', z: tab, name: '',
            method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '',
            persist: false, proxy: '', insecureHTTPParser: false,
            authType: '', senderr: false, headers: [],
            x: xs[4], y: 100, wires: [['flowgen-debug']]
        });
    }

    nodes.push({
        id: 'flowgen-debug', type: 'debug', z: tab, name: '',
        active: true, tosidebar: true, console: false, tostatus: false,
        complete: 'payload', targetType: 'msg', statusVal: '', statusType: 'auto',
        x: xs[digest ? 5 : 3], y: 100, wires: []
    });
    if (withTab) { return nodes; }
    return nodes.slice(1).map(function (node) {
        const copy = Object.assign({}, node);
        delete copy.z;
        return copy;
    });
}

function buildFlows(doc, targets, options) {
    const withTab = !options || options.tab !== false;
    const nodes = [];
    let row = 0;
    for (const entry of targets) {
        const built = buildFlow(doc, entry.method, entry.path, { tab: false });
        const offset = row * 100;
        const suffix = '-' + row;
        const rename = id => id + suffix;
        for (const node of built) {
            node.id = rename(node.id);
            node.y = node.y + offset;
            node.wires = (node.wires || []).map(list => list.map(rename));
            nodes.push(node);
        }
        row++;
    }
    if (!withTab) { return nodes; }
    const tab = {
        id: 'flowgen-tab', type: 'tab',
        label: targets.length === 1
            ? String(targets[0].method).toUpperCase() + ' ' + targets[0].path
            : targets.length + ' endpoints',
        disabled: false, info: '', env: []
    };
    for (const node of nodes) node.z = tab.id;
    return [tab].concat(nodes);
}

return {
    parseDocument, detectFormat, generate, generateOpenApi3, generateSwagger2,
    listOperations, buildFlow, buildFlows, formatList, nodeWidth, parseCollection
};
}));

if (typeof module === 'object' && module.exports && require.main === module) {
    const fs = require('fs');
    const {
        parseDocument, generate, listOperations, buildFlow, formatList
    } = module.exports;

    const path = require('path');
    const os = require('os');
    const { execFileSync } = require('child_process');

    const gatherDir = root => {
        const files = [];
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === '.git' || entry.name === 'node_modules') continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (/\.(bru|ya?ml|json)$/.test(entry.name)) {
                    files.push({ path: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
                }
            }
        };
        walk(root);
        return files;
    };

    const unzip = buffer => new Promise((resolve, reject) => {
        const yauzl = require('yauzl');
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
            if (err) return reject(err);
            const files = [];
            zip.on('error', reject);
            zip.on('end', () => resolve(files));
            zip.on('entry', entry => {
                const name = String(entry.fileName).replace(/\\/g, '/');
                if (/\/$/.test(name) || !/\.(bru|ya?ml|json)$/.test(name) ||
                        /(^|\/)(\.git|node_modules)\//.test(name)) {
                    return zip.readEntry();
                }
                zip.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr) return reject(streamErr);
                    const chunks = [];
                    stream.on('data', c => chunks.push(c));
                    stream.on('error', reject);
                    stream.on('end', () => {
                        files.push({ path: name, text: Buffer.concat(chunks).toString('utf8') });
                        zip.readEntry();
                    });
                });
            });
            zip.readEntry();
        });
    });

    const load = async source => {
        const { parseCollection } = module.exports;
        if (/\.git$/.test(String(source).trim())) {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-git-'));
            try {
                execFileSync('git',
                    ['clone', '--quiet', '--depth', '1', String(source).trim(), tmp],
                    { stdio: 'pipe' });
                return parseCollection(gatherDir(tmp));
            } finally {
                try {
                    fs.rmSync(tmp, {
                        recursive: true, force: true, maxRetries: 5, retryDelay: 100
                    });
                } catch (err) {
                    process.stderr.write('could not remove ' + tmp + ': ' + err.message + '\n');
                }
            }
        }
        if (/^https?:\/\/\S+$/i.test(String(source || '').trim())) {
            return parseDocument(await read(source));
        }
        const stat = fs.statSync(source);
        if (stat.isDirectory()) return parseCollection(gatherDir(source));
        if (/\.zip$/i.test(source)) {
            return parseCollection(await unzip(fs.readFileSync(source)));
        }
        const text = fs.readFileSync(source, 'utf8');
        if (/\.bru$/.test(source)) {
            return parseCollection([{ path: path.basename(source), text: text }]);
        }
        return parseDocument(text);
    };

    const read = source => new Promise((resolve, reject) => {
        if (!/^https?:\/\/\S+$/i.test(String(source || '').trim())) {
            return resolve(fs.readFileSync(source, 'utf8'));
        }
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
    let output = null;
    const rest = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output' || args[i] === '-o') { output = args[++i]; continue; }
        const inline = /^(?:--output=)(.+)$/.exec(args[i]);
        if (inline) { output = inline[1]; continue; }
        rest.push(args[i]);
    }
    const positional = rest.filter(a => !/^(--list|-l|--flow|-f)$/.test(a));
    const file = positional[0], method = positional[1], target = positional[2];
    if (!file) {
        process.stderr.write(
            'usage:\n' +
            '  node-red-flowgen <spec.json|spec.yaml|url> --list\n' +
            '  node-red-flowgen <spec.json|spec.yaml|url> <method> <path>\n' +
            '  node-red-flowgen <spec.json|spec.yaml|url> <method> <path> --flow\n' +
            '  node-red-flowgen <spec.json|spec.yaml|url> <method> <path> --output <file>\n' +
            'example:\n' +
            '  node-red-flowgen petstore.yaml --list\n' +
            '  node-red-flowgen petstore.yaml post /pet\n' +
            '  node-red-flowgen petstore.yaml get /pet/{petId} --flow\n' +
            '  node-red-flowgen https://petstore.swagger.io/v2/swagger.json --list\n');
        process.exit(1);
    }
    const write = text => {
        if (!output) { return process.stdout.write(text); }
        fs.mkdirSync(require('path').dirname(require('path').resolve(output)), { recursive: true });
        fs.writeFileSync(output, text);
        process.stderr.write('written ' + output + '\n');
    };

    const ask = question => new Promise(resolve => {
        const out = process.stderr;
        let answer = '';
        out.write(question);
        const onKey = data => {
            const key = data.toString();
            if (key === '\u0003') { process.stdin.removeListener('data', onKey); out.write('\n'); return resolve(''); }
            if (key === '\r' || key === '\n') {
                process.stdin.removeListener('data', onKey);
                out.write('\n');
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdin.pause();
                return resolve(answer);
            }
            if (key === '\u007f' || key === '\b') {
                if (answer) { answer = answer.slice(0, -1); out.write('\b \b'); }
                return;
            }
            const typed = key.replace(/[\u0000-\u001f\u007f]/g, '');
            if (typed) { answer += typed; out.write('*'.repeat(typed.length)); }
        };
        process.stdin.on('data', onKey);
    });

    const askCredentials = async code => {
        const wanted = [];
        for (const match of code.matchAll(/\{(token|credentials|api[_-]?key|apikey)\}/gi)) {
            if (wanted.indexOf(match[1]) === -1) wanted.push(match[1]);
        }
        for (const match of code.matchAll(/"([\w.-]*(?:key|token|secret|auth[\w-]*))":\s*""/gi)) {
            if (wanted.indexOf(match[1]) === -1) wanted.push(match[1]);
        }
        if (!wanted.length) return code;

        let filled = code;
        for (const name of wanted) {
            const value = await ask('Value for ' + name + ' (enter to skip): ');
            if (!value) continue;
            filled = filled.split('{' + name + '}').join(value);
            filled = filled.split('"' + name + '": ""')
                .join('"' + name + '": ' + JSON.stringify(value));
        }
        return filled;
    };

    const choose = (doc, operations) => new Promise((resolve, reject) => {
        const out = process.stderr;
        const rows = Math.max(3, Math.min(15, (process.stdout.rows || 24) - 6));
        let term = '';
        let cursor = 0;
        let top = 0;
        let painted = 0;

        const matching = () => {
            const words = term.toLowerCase().split(/\s+/).filter(Boolean);
            return operations.filter(op => {
                const text = (op.method + ' ' + op.path + ' ' + (op.summary || '')).toLowerCase();
                return words.every(word => text.indexOf(word) !== -1);
            });
        };

        const paint = () => {
            const list = matching();
            if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
            if (cursor < top) top = cursor;
            if (cursor >= top + rows) top = cursor - rows + 1;

            let text = painted ? '\x1b[' + painted + 'A\x1b[0J' : '';
            text += 'Search: ' + term + '\n';
            const page = list.slice(top, top + rows);
            for (let i = 0; i < page.length; i++) {
                const op = page[i];
                const label = op.method.toUpperCase().padEnd(7) + op.path +
                    (op.summary ? '  ' + op.summary : '');
                text += (top + i === cursor ? '\x1b[7m> ' + label + '\x1b[0m' : '  ' + label) + '\n';
            }
            if (!page.length) text += '  no match\n';
            text += list.length + ' of ' + operations.length +
                '   up/down to move, type to filter, enter to choose, esc to cancel\n';
            painted = page.length + 2 || 3;
            out.write(text);
        };

        const stop = keepOpen => {
            process.stdin.removeListener('data', onKey);
            if (!keepOpen) {
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdin.pause();
            }
            out.write('\x1b[' + painted + 'A\x1b[0J');
        };

        const onKey = data => {
            const key = data.toString();
            if (key === '\u0003' || key === '\u001b') { stop(); return reject(new Error('cancelled')); }
            if (key === '\r' || key === '\n') {
                const list = matching();
                if (!list.length) return;
                stop(true);
                return resolve(list[cursor]);
            }
            if (key === '\u001b[A') { cursor = Math.max(0, cursor - 1); return paint(); }
            if (key === '\u001b[B') { cursor = Math.min(matching().length - 1, cursor + 1); return paint(); }
            if (key === '\u001b[C' || key === '\u001b[D') { return; }
            if (key === '\u007f' || key === '\b') { term = term.slice(0, -1); cursor = 0; return paint(); }
            const typed = key.replace(/[\u0000-\u001f\u007f]/g, '');
            if (typed) { term += typed; cursor = 0; return paint(); }
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onKey);
        paint();
    });

    load(file).then(doc => {
        if (listMode) {
            write(formatList(listOperations(doc)) + '\n');
        } else if (!method) {
            const list = listOperations(doc);
            if (!process.stdin.isTTY || !list.count) {
                write(formatList(list) + '\n');
                return;
            }
            return choose(doc, list.operations).then(async op => {
                if (flowMode) {
                    const nodes = buildFlow(doc, op.method, op.path);
                    const fn = nodes.find(node => node.type === 'function');
                    fn.func = await askCredentials(fn.func);
                    return write(JSON.stringify(nodes, null, 4) + '\n');
                }
                write(await askCredentials(generate(doc, op.method, op.path)) + '\n');
            });
        } else {
            write(flowMode
                ? JSON.stringify(buildFlow(doc, method, target), null, 4) + '\n'
                : generate(doc, method, target) + '\n');
        }
    }).catch(err => {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    });
}
