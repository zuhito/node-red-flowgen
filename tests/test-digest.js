'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const flowgen = require('../flowgen');

const SPEC = path.join(__dirname, 'specs', 'httpbingo-openapi3.yaml');
const TARGET = '/digest-auth/{qop}/{user}/{passwd}';

function generate() {
    const doc = flowgen.parseDocument(fs.readFileSync(SPEC, 'utf8'));
    return flowgen.generate(doc, 'get', TARGET);
}

// What a reader does by hand: fill the placeholders, comment out the first
// pass, uncomment the second, and paste the challenge values in.
function swapPasses(code, challenge) {
    const out = [];
    let inSecond = false;
    for (const line of code.split('\n')) {
        if (line.startsWith('// ----- second pass')) { inSecond = true; continue; }
        if (line.startsWith('// ------------------')) { inSecond = false; continue; }
        if (line === 'const credentials = null;') {
            out.push('// const credentials = null;');
            continue;
        }
        if (inSecond) {
            out.push(line.replace(/^\/\/ ?/, ''));
            continue;
        }
        out.push(line);
    }
    let text = out.join('\n');
    for (const [name, value] of Object.entries(challenge)) {
        text = text.replace(new RegExp('const ' + name + ' = "[^"]*";'),
            'const ' + name + ' = "' + value + '";');
    }
    return text;
}

test('the first pass goes out with no authorization header', () => {
    const code = generate().replace(/\{user\}/g, 'someuser').replace(/\{passwd\}/g, 'somepass');
    const msg = new Function('msg', code).call(null, {});
    assert.strictEqual(msg.headers.authorization, undefined);
    assert.match(msg.url, /digest-auth\/auth\/someuser\/somepass$/);
});

test('the second pass computes the response RFC 2617 asks for', () => {
    const raw = generate().replace(/\{user\}/g, 'someuser').replace(/\{passwd\}/g, 'somepass');
    const code = swapPasses(raw, {
        realm: 'httpbingo',
        nonce: 'deadbeef',
        qop: 'auth',
        opaque: 'op4que'
    });

    const msg = new Function('msg', 'require', code)
        .call(null, { url: 'https://httpbingo.org/digest-auth/auth/someuser/somepass' },
            require);
    const header = msg.headers.authorization;
    assert.ok(header && header.startsWith('Digest '), 'got ' + header);

    const fields = {};
    for (const part of header.slice(7).split(',')) {
        const at = part.indexOf('=');
        fields[part.slice(0, at).trim()] = part.slice(at + 1).trim().replace(/^"|"$/g, '');
    }

    const md5 = value => crypto.createHash('md5').update(value).digest('hex');
    const uri = '/digest-auth/auth/someuser/somepass';
    const ha1 = md5('someuser:httpbingo:somepass');
    const ha2 = md5('GET:' + uri);
    const expected = md5([ha1, 'deadbeef', fields.nc, fields.cnonce, 'auth', ha2].join(':'));

    assert.strictEqual(fields.username, 'someuser');
    assert.strictEqual(fields.realm, 'httpbingo');
    assert.strictEqual(fields.nonce, 'deadbeef');
    assert.strictEqual(fields.uri, uri);
    assert.strictEqual(fields.qop, 'auth');
    assert.strictEqual(fields.opaque, 'op4que');
    assert.strictEqual(fields.response, expected,
        'the response hash must match what the server will recompute');
});

test('the second pass drops qop fields when the challenge omits qop', () => {
    const raw = generate().replace(/\{user\}/g, 'u').replace(/\{passwd\}/g, 'p');
    const code = swapPasses(raw, {
        realm: 'httpbingo', nonce: 'n0nce', qop: '', opaque: ''
    });
    const msg = new Function('msg', 'require', code)
        .call(null, { url: 'https://httpbingo.org/digest-auth/auth/u/p' }, require);
    const header = msg.headers.authorization;

    assert.ok(!/\bqop=/.test(header), 'qop must be absent: ' + header);
    assert.ok(!/\bnc=/.test(header), 'nc must be absent: ' + header);
    assert.ok(!/\bopaque=/.test(header), 'opaque must be absent: ' + header);

    const md5 = value => crypto.createHash('md5').update(value).digest('hex');
    const uri = '/digest-auth/auth/u/p';
    const expected = md5([md5('u:httpbingo:p'), 'n0nce', md5('GET:' + uri)].join(':'));
    assert.ok(header.includes('response="' + expected + '"'),
        'the unqualified form hashes ha1:nonce:ha2');
});
