'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const express = require('express');
const RED = require('node-red');
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
    // The code carries its own MD5 and needs nothing passed in.
    return new Function('msg', code).call(null, msg);
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
    const msg = new Function('msg', code)
        .call(null, { url: 'https://httpbingo.org/x', headers: {}, payload: { ok: true } });
    assert.deepStrictEqual(msg.payload, { ok: true },
        'an authenticated reply must not be turned into another request');
});


test('the retry depends on nothing outside plain JavaScript', () => {
    const node = retryNode();
    assert.ok(!/require\s*\(/.test(node.func),
        'a function node has no require, so calling it would throw at runtime');
    assert.deepStrictEqual(node.libs, [],
        'libs only works where functionExternalModules is enabled, and many ' +
        'deployments disable it');
    const executable = node.func.split('\n')
        .filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.ok(!/\bcrypto\b/.test(executable),
        'nothing may reach for the crypto module at runtime');
});

test('the embedded MD5 agrees with crypto', () => {
    // The digest response is a chain of MD5s. If this drifts from the real
    // algorithm every signature is wrong, and the server just answers 401.
    const md5 = new Function('msg', retryNode().func.split('const challenge')[0] +
        '\nreturn md5;')({});

    const inputs = ['', 'a', 'abc', 'message digest', 'someuser:httpbingo:somepass',
        'GET:/digest-auth/auth/u/p', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63),
        'a'.repeat(64), 'a'.repeat(65), 'a'.repeat(200), 'unicode: \u00fc\u00e9',
        '\u65e5\u672c\u8a9e'];
    for (const value of inputs) {
        assert.strictEqual(md5(value),
            crypto.createHash('md5').update(value).digest('hex'),
            'md5 differs for ' + JSON.stringify(value));
    }
    // Lengths either side of every block and padding boundary.
    for (let length = 0; length < 200; length++) {
        const value = 'x'.repeat(length);
        assert.strictEqual(md5(value),
            crypto.createHash('md5').update(value).digest('hex'),
            'md5 differs at length ' + length);
    }
});

// Everything above reasons about the generated text. This runs it: a real
// Node-RED, a server that answers 401 with a challenge, and an assertion that
// the flow reaches 200 on its own.
test('the flow authenticates against a challenging server', async () => {
    let received = null;
    const target = http.createServer((req, res) => {
        if (!req.headers.authorization) {
            res.writeHead(401, {
                'www-authenticate': 'Digest realm="r", nonce="n1", qop="auth", opaque="o1"',
                'set-cookie': 'fake=v; Path=/'
            });
            return res.end('{}');
        }
        received = { auth: req.headers.authorization, cookie: req.headers.cookie };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
    });
    await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
    const targetPort = target.address().port;

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowgen-digest-'));
    const app = express();
    const server = http.createServer(app);
    RED.init(server, {
        httpAdminRoot: false, httpNodeRoot: false, userDir: userDir,
        flowFile: 'flows.json',
        // The point of this test: the flow has to work on a deployment that
        // refuses to load external modules into a function node.
        functionExternalModules: false,
        logging: { console: { level: 'fatal', metrics: false, audit: false } }
    });
    fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await RED.start();

    try {
        const nodes = flow();
        let probeId = null;
        for (const node of nodes) {
            if (node.type === 'inject') { node.once = true; node.onceDelay = 0.2; }
            if (node.type === 'function' && node.func) {
                node.func = node.func
                    .replace(/\{user\}/g, 'u').replace(/\{passwd\}/g, 'p')
                    .replace(/https:\/\/httpbingo\.org/g, 'http://127.0.0.1:' + targetPort);
            }
            if (node.type === 'debug') {
                probeId = node.id;
                node.type = 'function';
                node.libs = [];
                node.outputs = 1;
                node.wires = [[]];
                node.func = 'global.set("digestResult", ' +
                    'JSON.stringify({ status: msg.statusCode, payload: msg.payload }));\n' +
                    'return msg;';
            }
        }
        fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
        await RED.nodes.loadFlows(true);

        const started = Date.now();
        let result = null;
        while (!result && Date.now() - started < 20000) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const node = RED.nodes.getNode(probeId);
            if (node) { result = node.context().global.get('digestResult'); }
        }

        assert.ok(result, 'the flow never produced a result');
        assert.deepStrictEqual(JSON.parse(result), { status: 200, payload: { ok: true } });
        assert.ok(received, 'the retry never reached the server');
        assert.match(received.auth, /^Digest username="u", realm="r", nonce="n1"/);
        assert.strictEqual(received.cookie, 'fake=v',
            'the cookie from the challenge has to come back with the retry');
    } finally {
        await RED.stop();
        await new Promise(resolve => server.close(resolve));
        target.close();
        fs.rmSync(userDir, { recursive: true, force: true });
    }
});
