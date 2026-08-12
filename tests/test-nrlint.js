'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const linter = require('nrlint/lib/linter.js');
const flowgen = require('../flowgen');

const CONFIG = {
        rules: {
                'align-to-grid': { gridSize: 20 },
                'no-overlapping-nodes': true
        }
};

linter.init({
        resolveRule: name => {
                try {
                        return require('nrlint/lib/rules/' + name + '.js');
                } catch (err) {
                        return undefined;
                }
        }
});

function lint(flow) {
        return linter.lint(JSON.parse(JSON.stringify(flow)), CONFIG);
}

function messages(result, ruleId) {
        const list = Array.isArray(result) ? result : (result && result.problems) || [];
        return list
                .filter(item => !ruleId || item.rule === ruleId || item.ruleId === ruleId)
                .map(item => (item.rule || item.ruleId) + ': ' + item.message);
}

function loadSpec(name) {
        return flowgen.parseDocument(
                fs.readFileSync(path.join(__dirname, 'specs', name), 'utf8'));
}

test('a generated flow sits on the default grid', () => {
        const doc = loadSpec('ollama-openapi3.yaml');
        for (const op of flowgen.listOperations(doc).operations) {
                const flow = flowgen.buildFlow(doc, op.method, op.path);
                assert.deepStrictEqual(messages(lint(flow), 'align-to-grid'), [],
                        op.method + ' ' + op.path + ' is off the grid');
        }
});

test('a generated flow has no overlapping nodes', () => {
        const doc = loadSpec('ollama-openapi3.yaml');
        for (const op of flowgen.listOperations(doc).operations) {
                const flow = flowgen.buildFlow(doc, op.method, op.path);
                assert.deepStrictEqual(messages(lint(flow), 'no-overlapping-nodes'), [],
                        op.method + ' ' + op.path + ' has overlapping nodes');
        }
});

test('a multi endpoint import stays on the grid and apart', () => {
        const doc = loadSpec('ollama-openapi3.yaml');
        const targets = flowgen.listOperations(doc).operations
                .slice(0, 6).map(op => ({ method: op.method, path: op.path }));
        const flow = flowgen.buildFlows(doc, targets);

        assert.deepStrictEqual(messages(lint(flow)), []);
});

test('every node coordinate is a multiple of the grid', () => {
        const doc = loadSpec('httpbingo-openapi3.yaml');
        for (const op of flowgen.listOperations(doc).operations) {
                for (const node of flowgen.buildFlow(doc, op.method, op.path)) {
                        if (node.type === 'tab') continue;
                        assert.strictEqual(node.y % 20, 0, node.type + ' y=' + node.y);
                }
        }
});

test('a long function name still leaves the flow on the grid', () => {
        const doc = flowgen.parseDocument(JSON.stringify({
                openapi: '3.0.3',
                info: { title: 'T', version: '1' },
                servers: [{ url: 'https://api.test' }],
                paths: { '/a/very/long/path/that/stretches/the/function/node/label': { get: {} } }
        }));
        const flow = flowgen.buildFlow(doc, 'get',
                '/a/very/long/path/that/stretches/the/function/node/label');
        assert.deepStrictEqual(messages(lint(flow)), []);
});

const LABEL = {
        inject: ['timestamp', false],
        'http request': ['http request', true],
        debug: ['msg.payload', true]
};

test('every node left edge lands on the grid, which is what the editor checks', () => {
        for (const name of ['httpbingo-openapi3.yaml', 'ollama-openapi3.yaml',
                'httpbingo-openapi3.yaml']) {
                const doc = loadSpec(name);
                for (const op of flowgen.listOperations(doc).operations) {
                        for (const node of flowgen.buildFlow(doc, op.method, op.path)) {
                                if (node.type === 'tab') continue;
                                const entry = node.type === 'function'
                                        ? [node.name, true] : LABEL[node.type];
                                const width = flowgen.nodeWidth(entry[0], entry[1]);
                                const edge = node.x - width / 2;
                                assert.strictEqual(edge % 20, 0, name + ' ' + op.method + ' ' +
                                        op.path + ': ' + node.type + ' x=' + node.x +
                                        ' w=' + width + ' puts the edge at ' + edge);
                        }
                }
        }
});
