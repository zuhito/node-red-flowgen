'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { errorWords, unexpectedErrors, ERROR_WORDS } = require('./error-words');

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

test('a count of something is data rather than a complaint', () => {
    for (const body of [
        // The petstore inventory reports how many orders sit in each state.
        '{"approved":50,"placed":10,"invalid":3}',
        '{"sold":2,"Invalid":1}',
        '{"errors":12,"processed":900}',
        '{"unknown":4}'
    ]) {
        assert.deepStrictEqual(errorWords(body), [],
            body + ' is a tally, not an error');
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

test('a map of counts keyed by free text is data, not a message', () => {
    // The petstore inventory returns a count per status string, and those
    // strings are whatever callers happened to create.
    assert.deepStrictEqual(errorWords({ pending: 1, unavailable: 4, sold: 2 }), []);
    assert.deepStrictEqual(errorWords({ invalid: 3, available: 5 }), []);
    // A map that carries prose is still scanned.
    assert.ok(errorWords({ status: 'invalid' }).length > 0);
});

test('the rejection a case asked for is not held against it', () => {
    assert.deepStrictEqual(
        unexpectedErrors('{"error":"Unauthorized"}', 401, [401]), []);
    assert.deepStrictEqual(
        unexpectedErrors('{"detail":"Forbidden"}', 403, [200, 403]), []);
});

test('anything beyond the rejection still fails, 4xx or not', () => {
    // The denial was expected, but a timeout alongside it was not.
    assert.ok(unexpectedErrors(
        '{"error":"Unauthorized","detail":"upstream timeout"}', 401, [401])
        .indexOf('timeout') !== -1);

    // A 4xx for a reason the case never asked about.
    assert.ok(unexpectedErrors('{"message":"malformed request body"}', 401, [401])
        .indexOf('malformed') !== -1);

    // The same words when the case wanted a healthy answer.
    assert.ok(unexpectedErrors('{"error":"Unauthorized"}', 401, [200]).length > 0);

    // 5xx is never the outcome a case asks for.
    assert.ok(unexpectedErrors('{"error":"internal server"}', 500, [500]).length > 0);
});

test('a healthy response reports nothing whatever the status', () => {
    assert.deepStrictEqual(unexpectedErrors('{"ok":true}', 200, [200]), []);
    assert.deepStrictEqual(unexpectedErrors('{"ok":true}', 404, [404]), []);
});

test('object keys are data, not prose, however the body arrives', () => {
    // The petstore inventory keys a count by whatever status callers created.
    const inventory = { pending: 1, unavailable: 4, sold: 2, invalid: 3 };
    assert.deepStrictEqual(errorWords(inventory), []);
    assert.deepStrictEqual(errorWords(JSON.stringify(inventory)), [],
        'curl hands the body back as a string, and it must read the same way');
});

test('a message in a value is still found inside a json string', () => {
    assert.ok(errorWords('{"error":"Service Unavailable"}').indexOf('unavailable') !== -1);
    assert.ok(errorWords('{"a":{"message":"invalid token"}}').indexOf('invalid') !== -1);
});

test('a body that is not json is scanned as it stands', () => {
    assert.ok(errorWords('Internal Server Error').indexOf('internal server') !== -1);
    assert.ok(errorWords('<html>503 Service Unavailable</html>')
        .indexOf('unavailable') !== -1);
});
