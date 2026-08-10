'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const flowgen = require('../flowgen');

const SPEC = path.join(__dirname, 'specs', 'httpbingo-openapi3.yaml');
const TARGET = '/digest-auth/{qop}/{user}/{passwd}';

function flow() {
    const doc = flowgen.parseDocument(fs.readFileSync(SPEC, 'utf8'));
    return flowgen.buildFlow(doc, 'get', TARGET);
}

function firstPass() {
    const doc = flowgen.parseDocument(fs.readFileSync(SPEC, 'utf8'));
    return flowgen.generate(doc, 'get', TARGET);
}

function retryNode() {
    const node = flow().find(n => n.type === 'function' && /digest challenge/.test(n.name));
    assert.ok(node, 'the flow must carry a node that signs the challenge');
    return node;
}

function sign(challenge, cookies, url) {
    const code = retryNode().func
        .replace(/\{user\}/g, 'someuser').replace(/\{passwd\}/g, 'somepass');
    const msg = {
        url: url || 'https://httpbingo.org/digest-auth/auth/someuser/somepass',
        headers: { 'www-authenticate': challenge }
    };
    if (cookies) { msg.headers['set-cookie'] = cookies; }
    return new Function('msg', 'require', code).call(null, msg, require);
}

function parse(header) {
    const out = {};
    for (const part of header.slice(7).split(', ')) {
        const at = part.indexOf('=');
        out[part.slice(0, at)] = part.slice(at + 1).replace(/^"|"$/g, '');
    }
    return out;
}

const CHALLENGE = 'Digest realm="httpbingo", nonce="deadbeef", qop="auth", ' +
    'opaque="op4que", algorithm=MD5';

test('digest builds a flow with a second request for the retry', () => {
    const nodes = flow().filter(n => n.type !== 'tab');
    const requests = nodes.filter(n => n.type === 'http request');
    assert.strictEqual(requests.length, 2,
        'digest needs one request for the challenge and one for the answer');
    assert.strictEqual(requests[0].senderr, true,
        'the 401 is expected, so it must not be raised as an error');
    assert.deepStrictEqual(requests[0].wires, [['flowgen-digest']]);
    assert.deepStrictEqual(requests[1].wires, [['flowgen-debug']]);
});

test('the first pass sends no credentials at all', () => {
    const code = firstPass()
        .replace(/\{user\}/g, 'someuser').replace(/\{passwd\}/g, 'somepass');
    const msg = new Function('msg', code).call(null, {});
    assert.strictEqual((msg.headers || {}).authorization, undefined);
    assert.ok(!/const credentials/.test(code),
        'nothing is computed before the challenge arrives');
    assert.ok(!/Digest \$\{/.test(code), 'no digest header is built here');
});

test('the retry signs the challenge the way RFC 2617 asks', () => {
    const msg = sign(CHALLENGE);
    const fields = parse(msg.headers.authorization);

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
    assert.strictEqual(fields.response, expected);
});

test('the retry carries the cookies the challenge came with', () => {
    // httpbin and its successors hand out a cookie with the 401 and refuse the
    // retry without it, which is what broke the earlier two pass attempt.
    const msg = sign(CHALLENGE, ['fake=fake_value; Path=/', 'stale_after=never; Path=/']);
    assert.strictEqual(msg.headers.cookie, 'fake=fake_value; stale_after=never');
});

test('the retry drops the qop fields when the challenge omits qop', () => {
    const msg = sign('Digest realm="httpbingo", nonce="n0nce"');
    const header = msg.headers.authorization;
    assert.ok(!/\bqop=/.test(header), header);
    assert.ok(!/\bnc=/.test(header), header);
    assert.ok(!/\bopaque=/.test(header), header);

    const md5 = value => crypto.createHash('md5').update(value).digest('hex');
    const uri = '/digest-auth/auth/someuser/somepass';
    const expected = md5([md5('someuser:httpbingo:somepass'), 'n0nce',
        md5('GET:' + uri)].join(':'));
    assert.ok(header.includes('response="' + expected + '"'));
});

test('a reply that is not a challenge passes straight through', () => {
    const code = retryNode().func;
    const msg = new Function('msg', 'require', code)
        .call(null, { url: 'https://httpbingo.org/x', headers: {}, payload: { ok: true } },
            require);
    assert.deepStrictEqual(msg.payload, { ok: true },
        'an authenticated reply must not be turned into another request');
});
