'use strict';

// Words that mark a response as a failure even when the status line says 200.
// Matched on word boundaries so that "errors": [] style keys and words such as
// "invalidate" or "terror" inside prose do not fire on their own.
const ERROR_WORDS = [
    'error', 'errors', 'exception', 'unknown', 'invalid', 'failure', 'failed',
    'unauthorized', 'unauthenticated', 'forbidden', 'denied', 'not found',
    'notfound', 'timeout', 'timed out', 'refused', 'unavailable',
    'bad request', 'internal server', 'traceback', 'stack trace', 'panic',
    'fatal', 'malformed', 'unsupported', 'missing required', 'quota exceeded',
    'rate limit', 'too many requests'
];

// An empty or false valued error field is the service saying nothing went
// wrong, so it must not trip the scan.
const ERROR_EXEMPT = [
    /"errors?"\s*:\s*(\[\s*\]|\{\s*\}|null|false|0|"")/gi,
    /"[a-z_]*(error|invalid|failed|failure)[a-z_]*"\s*:\s*(false|null|0)/gi,
    // A key that merely counts something is data, not a complaint: the petstore
    // inventory reports how many orders sit in an "invalid" state, and an api
    // that tallies "errors": 12 is describing its own records.
    /"[a-z_ -]*(error|invalid|failed|failure|unknown)[a-z_ -]*"\s*:\s*\d+/gi
];

// A JSON object's keys are frequently data rather than field names: the
// petstore inventory returns a count per caller supplied status string, so
// words like unavailable appear there as values that happen to be keys. Only
// the string values of a parsed body are scanned; keys never are.
function scannableText(body) {
    let parsed = body;
    if (typeof body === 'string') {
        const trimmed = body.trim();
        if (!/^[{[]/.test(trimmed)) return body;
        try { parsed = JSON.parse(trimmed); } catch (err) { return body; }
    }
    if (!parsed || typeof parsed !== 'object') return String(parsed);
    // A key is only meaningful when it names the field, which is to say when it
    // carries a message rather than a count. "error": "boom" is the service
    // reporting a fault; "unavailable": 4 is a tally of pets.
    const parts = [];
    (function walk(node) {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node && typeof node === 'object') {
            for (const key of Object.keys(node)) {
                const value = node[key];
                const empty = value === null || value === undefined ||
                    (Array.isArray(value) && !value.length) ||
                    (value && typeof value === 'object' && !Array.isArray(value) &&
                        !Object.keys(value).length);
                if (typeof value === 'string' && value.trim()) parts.push(key);
                else if (value && typeof value === 'object' && !empty) parts.push(key);
                walk(value);
            }
            return;
        }
        if (typeof node === 'string') parts.push(node);
    })(parsed);
    return parts.join('\n');
}

function errorWords(body) {
    if (body === null || body === undefined) return [];
    let text = scannableText(body);
    if (!text) return [];
    for (const pattern of ERROR_EXEMPT) text = text.replace(pattern, ' ');
    const found = [];
    for (const word of ERROR_WORDS) {
        const escaped = word
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/ /g, '[\\s_-]*');
        const pattern = new RegExp('(^|[^0-9a-z])' + escaped + '($|[^0-9a-z])', 'i');
        if (pattern.test(text) && found.indexOf(word) === -1) found.push(word);
    }
    return found;
}

// The words a server uses to say "you may not do that". Where a case expects a
// 4xx these are the response doing its job; anything else in the body is a
// complaint nobody asked for.
const REJECTION_WORDS = new Set([
    'unauthorized', 'unauthenticated', 'forbidden', 'denied',
    'not found', 'notfound', 'invalid', 'error'
]);

// Returns the words that should fail a run, given the status that came back and
// the statuses the case was willing to accept.
function unexpectedErrors(body, status, expected) {
    const hits = errorWords(body);
    if (!hits.length) return [];
    const asked = Array.isArray(expected) && expected.indexOf(status) !== -1;
    const rejectionWanted = asked && status >= 400 && status < 500;
    if (rejectionWanted && hits.every(word => REJECTION_WORDS.has(word))) return [];
    return hits;
}

module.exports = { errorWords, unexpectedErrors, ERROR_WORDS, REJECTION_WORDS };
