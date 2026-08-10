'use strict';

const js = require('@eslint/js');

const NODE_GLOBALS = {
    require: 'readonly',
    module: 'writable',
    exports: 'writable',
    process: 'readonly',
    console: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    URL: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly'
};

const BROWSER_GLOBALS = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    fetch: 'readonly',
    $: 'readonly',
    RED: 'readonly',
    MouseEvent: 'readonly',
    FileReader: 'readonly',
    Blob: 'readonly',
    self: 'readonly',
    getComputedStyle: 'readonly'
};

module.exports = [
    {
        ignores: ['node_modules/**', 'coverage/**', 'samples/**']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS }
        },
        rules: {
            'no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                caughtErrors: 'none'
            }],
            'no-var': 'off',
            eqeqeq: ['error', 'smart'],
            'no-console': 'off',
            'prefer-const': 'off',
            semi: ['error', 'always'],
            'no-trailing-spaces': 'error',
            'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 0 }],
            // The escape analysis fires on deliberately escaped quotes inside
            // regexes that assert on generated code, where the escape is noise
            // rather than a mistake.
            'no-useless-escape': 'off',
            // let x = null followed by an unconditional reassignment reads
            // clearly and is used throughout this codebase.
            'no-useless-assignment': 'off',
            // Control characters and ANSI escapes are the subject of these
            // regexes, not an accident.
            'no-control-regex': 'off',
            // Runs of spaces in these patterns mirror generated indentation,
            // where {4} would obscure what is being matched.
            'no-regex-spaces': 'off'
        }
    }
];
