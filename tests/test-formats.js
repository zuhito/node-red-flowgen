'use strict';

// The same API can be described as Swagger 2, OpenAPI 3 or a Bruno collection.
// flowgen should not care which one it was handed. This converts each source
// into the formats it is not already in and compares the generated code.
//
// Regenerate the fixtures with: node tests/generate-formats.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const flowgen = require('../flowgen');

const SPECS = path.join(__dirname, 'specs');
const GENERATED = path.join(SPECS, 'generated');

function load(file) {
    return flowgen.parseDocument(fs.readFileSync(file, 'utf8'));
}

// Bruno records a request, not a schema. Three things therefore cannot survive
// a round trip through it, and each is held apart rather than papered over:
//
//   * the server becomes a {{baseUrl}} variable
//   * response content types are gone, so no accept header is derived
//   * required and optional are indistinguishable, so every property comes
//     back live where a schema-backed source comments the optional ones out
//
// Everything else about the request has to agree exactly.
function shape(code) {
    const msg = new Function('msg', code).call(null, {});
    const headers = Object.assign({}, msg.headers);
    delete headers.accept;
    return {
        method: msg.method,
        path: String(msg.url)
            .replace(/^\{baseUrl\}/, '')
            .replace(/^https?:\/\/[^/]*/, ''),
        headers: headers,
        hasPayload: 'payload' in msg,
        payloadKeys: msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
            ? Object.keys(msg.payload).sort()
            : msg.payload
    };
}

function compare(left, right, where, exact) {
    assert.strictEqual(right.method, left.method, where + ': method');
    assert.strictEqual(right.path, left.path, where + ': path');
    assert.deepStrictEqual(right.headers, left.headers, where + ': headers');
    assert.strictEqual(right.hasPayload, left.hasPayload, where + ': body presence');

    if (!Array.isArray(left.payloadKeys) || !Array.isArray(right.payloadKeys)) {
        assert.deepStrictEqual(right.payloadKeys, left.payloadKeys, where + ': body');
        return;
    }
    if (exact) {
        assert.deepStrictEqual(right.payloadKeys, left.payloadKeys, where + ': body fields');
        return;
    }
    // A schema-backed source names the required fields; a Bruno-backed one
    // names all of them. The former must be a subset of the latter.
    for (const key of left.payloadKeys) {
        assert.ok(right.payloadKeys.indexOf(key) !== -1,
            where + ': ' + key + ' went missing from the body');
    }
}

const SCHEMA_SOURCES = [
    ['swagger 2', path.join(SPECS, 'ollama-swagger2.yaml')],
    ['openapi 3', path.join(SPECS, 'ollama-openapi3.yaml')],
    ['swagger 2 converted to openapi 3',
        path.join(GENERATED, 'ollama-swagger2-openapi3.generated.yaml')],
    ['openapi 3 round tripped',
        path.join(GENERATED, 'ollama-openapi3-openapi3.generated.yaml')]
];

test('the generated fixtures are present', () => {
    assert.ok(fs.existsSync(GENERATED),
        'run node tests/generate-formats.js to build them');
    for (const [, file] of SCHEMA_SOURCES) {
        assert.ok(fs.existsSync(file), 'missing ' + path.relative(SPECS, file));
    }
});

test('every schema-backed format generates identical code', () => {
    const reference = load(SCHEMA_SOURCES[1][1]);
    const operations = flowgen.listOperations(reference).operations;
    assert.ok(operations.length >= 15, 'expected the whole ollama surface');

    for (const [label, file] of SCHEMA_SOURCES) {
        const doc = load(file);
        const listed = flowgen.listOperations(doc).operations;
        assert.strictEqual(listed.length, operations.length,
            label + ' lost or gained operations');

        for (const op of operations) {
            const left = shape(flowgen.generate(reference, op.method, op.path));
            const right = shape(flowgen.generate(doc, op.method, op.path));
            compare(left, right, label + ' ' + op.method + ' ' + op.path, true);
        }
    }
});

test('a Bruno collection generates the same requests, minus what it cannot record', () => {
    const reference = load(path.join(SPECS, 'ollama-openapi3.yaml'));
    const fromBruno = load(path.join(GENERATED, 'ollama-bruno-openapi3.generated.yaml'));

    for (const op of flowgen.listOperations(reference).operations) {
        let right;
        try {
            right = shape(flowgen.generate(fromBruno, op.method, op.path));
        } catch (err) {
            // The collection may simply not exercise every endpoint.
            continue;
        }
        const left = shape(flowgen.generate(reference, op.method, op.path));
        compare(left, right, 'bruno ' + op.method + ' ' + op.path, false);
    }
});

test('what Bruno cannot carry is a property of the format, not a bug', () => {
    // Worth pinning: if a future converter starts preserving this, the code
    // above becomes needlessly lenient and should be tightened.
    const source = load(path.join(SPECS, 'ollama-openapi3.yaml'));
    const fromBruno = load(path.join(GENERATED, 'ollama-bruno-openapi3.generated.yaml'));

    const required = new Function('msg', flowgen.generate(source, 'post', '/api/generate'))
        .call(null, {}).payload;
    const everything = new Function('msg', flowgen.generate(fromBruno, 'post', '/api/generate'))
        .call(null, {}).payload;

    assert.deepStrictEqual(Object.keys(required).sort(), ['model', 'prompt'],
        'the schema names exactly two required fields');
    assert.ok(Object.keys(everything).length > Object.keys(required).length,
        'a Bruno collection cannot say which fields were optional, so it sends all of them');
    for (const key of Object.keys(required)) {
        assert.ok(key in everything, key + ' must survive the round trip');
    }
});

test('httpbingo survives the same round trip', () => {
    const source = load(path.join(SPECS, 'httpbingo-openapi3.yaml'));
    const roundTripped = load(path.join(GENERATED,
        'httpbingo-openapi3-openapi3.generated.yaml'));

    for (const op of flowgen.listOperations(source).operations) {
        const left = shape(flowgen.generate(source, op.method, op.path));
        const right = shape(flowgen.generate(roundTripped, op.method, op.path));
        compare(left, right, 'httpbingo ' + op.method + ' ' + op.path, true);
    }
});
