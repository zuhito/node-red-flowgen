'use strict';

// Lints the JavaScript inside the plugin's HTML. That code runs in the editor,
// where a syntax error costs the whole script and takes the API Spec tab with
// it, so it is the code that most needs checking, and it was the only source
// file eslint never saw.
//
//   node tests/lint-html.js
//
// Line numbers are reported against the HTML file, not the extracted snippet,
// so a complaint can be acted on directly.

const fs = require('fs');
const path = require('path');
const { ESLint } = require('eslint');

const FILES = [path.join(__dirname, '..', 'flowgen-plugin.html')];

// The editor supplies these; the script neither declares nor imports them.
const EDITOR_GLOBALS = {
    RED: 'readonly',
    $: 'readonly',
    jQuery: 'readonly',
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    FileReader: 'readonly',
    Blob: 'readonly',
    fetch: 'readonly',
    URL: 'readonly',
    TextDecoder: 'readonly',
    console: 'readonly',
    Promise: 'readonly'
};

function blocks(html) {
    const found = [];
    const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        const before = html.slice(0, match.index + match[0].indexOf(match[1]));
        found.push({ code: match[1], firstLine: before.split('\n').length });
    }
    return found;
}

async function main() {
    const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: {
            languageOptions: {
                // The editor runs this in a browser, and the file is written
                // deliberately in the older style: no arrow functions, var
                // rather than const. A syntax level the oldest supported
                // browser can parse matters more here than modern shorthand,
                // so the check is set to match rather than to modernise.
                ecmaVersion: 5,
                sourceType: 'script',
                globals: EDITOR_GLOBALS
            },
            rules: {
                'no-undef': 'error',
                // ES5 has no optional catch binding, so a catch that only
                // wants to fall back still has to name the error.
                'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
                'no-redeclare': 'error',
                'no-dupe-keys': 'error',
                'no-dupe-args': 'error',
                'no-duplicate-case': 'error',
                'no-unreachable': 'error',
                'no-fallthrough': 'error',
                'no-cond-assign': 'error',
                'no-constant-condition': 'error',
                'no-empty': ['error', { allowEmptyCatch: true }],
                'no-func-assign': 'error',
                'no-obj-calls': 'error',
                'no-sparse-arrays': 'error',
                'use-isnan': 'error',
                'valid-typeof': 'error',
                eqeqeq: ['error', 'smart'],
                semi: ['error', 'always'],
                'no-trailing-spaces': 'error'
            }
        }
    });

    let problems = 0;
    for (const file of FILES) {
        const html = fs.readFileSync(file, 'utf8');
        const scripts = blocks(html);
        if (!scripts.length) {
            process.stdout.write(path.basename(file) + ': no script block found\n');
            continue;
        }

        for (const script of scripts) {
            const results = await eslint.lintText(script.code, { filePath: file + '.js' });
            for (const result of results) {
                for (const message of result.messages) {
                    problems++;
                    const line = script.firstLine + message.line - 1;
                    process.stdout.write('::error file=' +
                        path.relative(path.join(__dirname, '..'), file) +
                        ',line=' + line + '::' + message.message +
                        ' (' + (message.ruleId || 'syntax') + ')\n');
                }
            }
        }
        process.stdout.write(path.basename(file) + ': ' + scripts.length +
            ' script block(s) checked\n');
    }

    if (problems) {
        process.stdout.write(problems + ' problem(s)\n');
        process.exit(1);
    }
    process.stdout.write('no problems\n');
}

main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
});
