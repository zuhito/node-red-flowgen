'use strict';

const fs = require('fs');
const path = require('path');

const file = process.env.BROWSER_COVERAGE_FILE ||
    path.join('browser-coverage', 'browser-coverage.json');

if (!fs.existsSync(file)) {
    process.stdout.write('::warning::no browser coverage was produced at ' + file + '\n');
    process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const pct = values => values.length
    ? Math.round(values.filter(n => n > 0).length / values.length * 100)
    : 0;

const lines = [];
for (const [name, entry] of Object.entries(data)) {
    const statements = Object.values(entry.s || {});
    const functions = Object.values(entry.f || {});
    const line = name.split(/[\\/]/).pop() +
        ' statements ' + pct(statements) +
        '% (' + statements.filter(n => n > 0).length + '/' + statements.length + ')' +
        ' functions ' + pct(functions) +
        '% (' + functions.filter(n => n > 0).length + '/' + functions.length + ')';
    lines.push(line);
    process.stdout.write('::notice::' + line + '\n');
}

if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '## Editor script coverage\n\n```\n' + lines.join('\n') + '\n```\n');
}
