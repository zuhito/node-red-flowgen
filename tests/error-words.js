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

function errorWords(body) {
    if (body === null || body === undefined) return [];
    let text = typeof body === 'string' ? body : JSON.stringify(body);
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

module.exports = { errorWords, ERROR_WORDS };
