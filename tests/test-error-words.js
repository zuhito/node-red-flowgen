'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { errorWords, ERROR_WORDS } = require('./error-words');

test('a healthy response reports nothing', () => {
    for (const body of [
        '{"slideshow":{"title":"Sample","author":"Yours Truly"}}',
        '{"headers":{"Accept":"application/json","Host":"httpbingo.org"}}',
        '{"uuid":"ab12cd34"}',
        '{"origin":"1.2.3.4"}',
        '<?xml version="1.0"?><slideshow><slide/></slideshow>',
        '',
        null,
        undefined
    ]) {
        assert.deepStrictEqual(errorWords(body), [],
            JSON.stringify(body) + ' should read as healthy');
    }
});

test('a response that names a failure is reported', () => {
    const cases = [
        ['{"error":"something broke"}', 'error'],
        ['{"Exception":"NullPointerException"}', 'exception'],
        ['{"message":"Invalid API key"}', 'invalid'],
        ['{"detail":"Unauthorized"}', 'unauthorized'],
        ['<html><body>404 Not Found</body></html>', 'not found'],
        ['{"detail":"Rate limit exceeded"}', 'rate limit'],
        ['{"status":"unknown"}', 'unknown'],
        ['Traceback (most recent call last):', 'traceback'],
        ['{"msg":"internal server failure"}', 'internal server']
    ];
    for (const [body, expected] of cases) {
        assert.ok(errorWords(body).indexOf(expected) !== -1,
            body + ' should report ' + expected + ', got ' +
            JSON.stringify(errorWords(body)));
    }
});

test('an empty or false error field is not a failure', () => {
    for (const body of [
        '{"errors":[]}',
        '{"error":null}',
        '{"errors":{}}',
        '{"error":""}',
        '{"errorCount":0}',
        '{"is_error":false}',
        '{"hasFailed":false}'
    ]) {
        assert.deepStrictEqual(errorWords(body), [],
            body + ' says nothing went wrong');
    }
});

test('a word that merely contains an error word does not fire', () => {
    for (const body of [
        '{"user":"terror"}',
        '{"status":"ok","invalidated":true}',
        '{"note":"unknowns are counted elsewhere"}',
        '{"city":"Panicale"}'
    ]) {
        assert.deepStrictEqual(errorWords(body), [],
            body + ' must not trip the scan');
    }
});

test('an object body is scanned as readily as a string', () => {
    assert.deepStrictEqual(errorWords({ error: 'boom' }), ['error']);
    assert.deepStrictEqual(errorWords({ ok: true }), []);
});

test('every configured word is actually detectable', () => {
    for (const word of ERROR_WORDS) {
        assert.ok(errorWords('the response said ' + word + ' here').length > 0,
            word + ' is configured but never matches');
    }
});
