'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { openApiToBruno } = require('@usebruno/converters');
const flowgen = require('../flowgen');

const SPECS = path.join(__dirname, 'specs');

function load(name) {
    return fs.readFileSync(path.join(SPECS, name), 'utf8');
}

function converted(text) {
    return flowgen.parseDocument(JSON.stringify(openApiToBruno(text)));
}

// Bruno collections carry no schema, so three things cannot survive the round
// trip and are held apart from the comparison rather than papered over:
//
//   * the server url becomes a {{baseUrl}} variable
//   * response content types are dropped, so no accept header is derived
//   * required and optional are indistinguishable, so every property comes
//     back as live code where the direct route comments the optional ones out
//
// Everything else about the request has to agree exactly.
function shape(code) {
    const msg = new Function('msg', 'require', code).call(null, {}, require);
    const headers = Object.assign({}, msg.headers);
    delete headers.accept;
    return {
        method: msg.method,
        path: String(msg.url).replace(/^\{baseUrl\}/, '').replace(/^https?:\/\/[^/]+/, ''),
        headers: headers,
        payloadKeys: msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
            ? Object.keys(msg.payload).sort() : msg.payload,
        hasPayload: 'payload' in msg
    };
}

// The direct route comments optional properties out, so the keys it leaves live
// must be a subset of what Bruno hands back rather than an exact match.
function payloadAgrees(direct, bruno) {
    if (!Array.isArray(direct.payloadKeys) || !Array.isArray(bruno.payloadKeys)) {
        return JSON.stringify(direct.payloadKeys) === JSON.stringify(bruno.payloadKeys);
    }
    return direct.payloadKeys.every(key => bruno.payloadKeys.indexOf(key) !== -1);
}

const CASES = ['httpbingo-openapi3.yaml', 'ollama-openapi3.yaml', 'httpbingo-full.yaml'];

for (const name of CASES) {
    test(name + ' generates the same requests through Bruno as it does directly', () => {
        const text = load(name);
        const direct = flowgen.parseDocument(text);
        const viaBruno = converted(text);

        const directOps = flowgen.listOperations(direct).operations;
        const brunoOps = flowgen.listOperations(viaBruno).operations;
        assert.strictEqual(brunoOps.length, directOps.length,
            'the converter must carry every operation across');

        for (const op of directOps) {
            const brunoOp = brunoOps.find(candidate =>
                candidate.method === op.method &&
                candidate.path.replace(/^\{baseUrl\}/, '') === op.path);
            assert.ok(brunoOp, 'no converted operation for ' + op.method + ' ' + op.path);

            const left = shape(flowgen.generate(direct, op.method, op.path));
            const right = shape(flowgen.generate(viaBruno, brunoOp.method, brunoOp.path));

            const where = op.method + ' ' + op.path + ' differs once converted to Bruno';
            assert.strictEqual(right.method, left.method, where);
            assert.strictEqual(right.hasPayload, left.hasPayload, where);
            assert.deepStrictEqual(right.headers, left.headers, where);
            // A path parameter with an enum default is resolved by the schema,
            // which Bruno does not carry, so compare the shape of the path.
            assert.strictEqual(right.path.split('/').length, left.path.split('/').length, where);
            assert.ok(payloadAgrees(left, right),
                where + ': direct keys ' + JSON.stringify(left.payloadKeys) +
                ' are not all in ' + JSON.stringify(right.payloadKeys));
        }
    });
}

test('a converted basic auth request still builds its credentials', () => {
    const viaBruno = converted(load('httpbingo-openapi3.yaml'));
    const code = flowgen.generate(viaBruno, 'get', '{baseUrl}/basic-auth/{user}/{passwd}');

    assert.match(code, /"authorization": `Basic \$\{credentials\}`/);
    assert.ok(code.includes('const credentials = Buffer.from(`{user}:{passwd}`)'),
        'the credential names must match the ones in the url');
});

test('a converted digest request keeps the two pass shape', () => {
    const viaBruno = converted(load('httpbingo-openapi3.yaml'));
    const code = flowgen.generate(viaBruno, 'get',
        '{baseUrl}/digest-auth/{qop}/{user}/{passwd}');

    assert.ok(!/authorization/.test(code),
        'the first pass collects the challenge and sends nothing');

    const retry = flowgen.buildFlow(viaBruno, 'get',
        '{baseUrl}/digest-auth/{qop}/{user}/{passwd}')
        .find(n => n.type === 'function' && /digest challenge/.test(n.name));
    assert.ok(retry, 'a converted digest request still gets its retry node');
    assert.ok(retry.func.includes('msg.headers.cookie = cookies'));
});
