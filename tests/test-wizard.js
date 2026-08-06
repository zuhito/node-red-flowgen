'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'flowgen.js');
const SPEC = path.join(__dirname, '..', 'specs', 'ollama-openapi3.yaml');

const openpty = (() => {
    try {
        return execFileSync('python3', ['-c', 'import pty'], { stdio: 'pipe' })
            || true;
    } catch (err) {
        return false;
    }
})();

function throughPty(keys, specFile, extraArgs) {
    const driver = `
import os, pty, time, select, sys, json
keys = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
        os.execvp(${JSON.stringify(process.execPath)},
                            [${JSON.stringify(process.execPath)}, ${JSON.stringify(CLI)}, ${JSON.stringify('SPEC_PLACEHOLDER')}] + json.loads(sys.argv[2]))
out = b''
time.sleep(1.5)
for k in keys:
        os.write(fd, k.encode())
        time.sleep(0.35)
        while select.select([fd], [], [], 0.1)[0]:
                try:
                        out += os.read(fd, 65536)
                except OSError:
                        break
end = time.time() + 3
while time.time() < end:
        if select.select([fd], [], [], 0.2)[0]:
                try:
                        chunk = os.read(fd, 65536)
                        if not chunk:
                                break
                        out += chunk
                except OSError:
                        break
os.close(fd)
sys.stdout.write(out.decode('utf8', 'replace'))
`;
    const file = path.join(os.tmpdir(), 'flowgen-pty-' + process.pid + '.py');
    fs.writeFileSync(file, driver.replace('SPEC_PLACEHOLDER', specFile || SPEC));
    try {
        return execFileSync('python3',
            [file, JSON.stringify(keys), JSON.stringify(extraArgs || [])],
            { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 24 });
    } finally {
        fs.unlinkSync(file);
    }
}

const flowJson = text => {
    const clean = text.replace(/\r/g, '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
    const start = clean.indexOf('[\n');
    assert.ok(start !== -1, 'no flow array in the output');
    return clean.slice(start, clean.lastIndexOf(']') + 1);
};

const urlLine = text => {
    const line = text.split('\n').find(l => l.indexOf('msg.url') !== -1);
    return line ? line.trim() : null;
};

test('a source on its own opens the picker and filters as you type',
    { skip: !openpty }, () => {
        const text = throughPty(['tags', '\r']);
        assert.match(text, /Search: tags/);
        assert.match(text, /up\/down to move, type to filter, enter to choose, esc to cancel/);
        assert.strictEqual(urlLine(text), 'msg.url = "http://127.0.0.1:11434/api/tags";');
    });

test('the arrow keys move the selection', { skip: !openpty }, () => {
    const first = throughPty(['\r']);
    assert.strictEqual(urlLine(first), 'msg.url = "http://127.0.0.1:11434/api/generate";');

    const third = throughPty(['\u001b[B', '\u001b[B', '\r']);
    assert.strictEqual(urlLine(third), 'msg.url = "http://127.0.0.1:11434/api/embed";');

    const back = throughPty(['\u001b[B', '\u001b[B', '\u001b[A', '\r']);
    assert.strictEqual(urlLine(back), 'msg.url = "http://127.0.0.1:11434/api/chat";');
});

test('the selection never runs past either end', { skip: !openpty }, () => {
    const top = throughPty(['\u001b[A', '\u001b[A', '\u001b[A', '\r']);
    assert.strictEqual(urlLine(top), 'msg.url = "http://127.0.0.1:11434/api/generate";');

    const bottom = throughPty(Array(25).fill('\u001b[B').concat(['\r']));
    assert.ok(urlLine(bottom), 'a selection is still made at the bottom');
});

test('backspace widens the filter again', { skip: !openpty }, () => {
    const text = throughPty(['tagsx', '\u007f', '\r']);
    assert.match(text, /Search: tags/);
    assert.strictEqual(urlLine(text), 'msg.url = "http://127.0.0.1:11434/api/tags";');
});

test('a filter matching nothing refuses to choose', { skip: !openpty }, () => {
    const text = throughPty(['zzzzz', '\r']);
    assert.match(text, /no match/);
    assert.strictEqual(urlLine(text), null);
});

test('the filter matches the summary as well as the path', { skip: !openpty }, () => {
    const text = throughPty(['running', '\r']);
    assert.strictEqual(urlLine(text), 'msg.url = "http://127.0.0.1:11434/api/ps";');
});

test('escape cancels without generating anything', { skip: !openpty }, () => {
    const text = throughPty(['\u001b']);
    assert.match(text, /cancelled/);
    assert.strictEqual(urlLine(text), null);
});

test('the picker counts the matches', { skip: !openpty }, () => {
    const text = throughPty(['api', '\u001b']);
    assert.match(text, /\d+ of 17/);
});

test('without a terminal the list is printed instead', () => {
    const result = execFileSync(process.execPath, [CLI, SPEC],
        { encoding: 'utf8' });
    assert.match(result, /^post \/api\/generate\s+# Generate a completion$/m);
    assert.ok(!/Search:/.test(result), 'no picker without a terminal');
});

const PETSTORE = path.join(require('os').tmpdir(), 'flowgen-spec-cache', 'v2.yaml');
const havePetstore = fs.existsSync(PETSTORE);

test('the picker asks for a credential and puts it into the code',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['findByStatus', '\r', 'mytoken', '\r'], PETSTORE);
        assert.match(text, /Value for token \(enter to skip\): /);
        assert.match(text, /"authorization": `Bearer mytoken`/);
        assert.ok(!/Bearer \{token\}/.test(text), 'the placeholder is replaced');
    });

test('an empty answer leaves the placeholder alone',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['findByStatus', '\r', '\r'], PETSTORE);
        assert.match(text, /Value for token \(enter to skip\): /);
        assert.match(text, /"authorization": `Bearer \{token\}`/);
    });

test('the credential is not echoed to the terminal',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['findByStatus', '\r', 'secret', '\r'], PETSTORE);
        const prompt = text.slice(text.indexOf('Value for token'));
        const echoed = prompt.slice(0, prompt.indexOf('\n'));
        assert.ok(!/secret/.test(echoed), 'the typed value must be masked: ' + echoed);
        assert.match(echoed, /\*{6}/, 'asterisks stand in for the value');
        assert.match(text, /"authorization": `Bearer secret`/);
    });

test('a spec with no credentials asks nothing', { skip: !openpty }, () => {
    const text = throughPty(['tags', '\r']);
    assert.ok(!/Value for /.test(text), 'no prompt for a spec without auth');
    assert.match(text, /msg\.url = "http:\/\/127\.0\.0\.1:11434\/api\/tags";/);
});

test('the picker can emit a whole flow with --flow',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['store/inventory', '\r', '\r'], PETSTORE, ['--flow']);
        const flow = JSON.parse(flowJson(text));
        assert.strictEqual(flow.map(n => n.type).join(','),
            'tab,inject,function,http request,debug');
        assert.match(flow.find(n => n.type === 'function').func, /store\/inventory/);
    });

test('a credential asked for in --flow mode lands in the function node',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['findByStatus', '\r', 'flowtoken', '\r'], PETSTORE, ['--flow']);
        assert.match(text, /Value for token/);
        const flow = JSON.parse(flowJson(text));
        assert.match(flow.find(n => n.type === 'function').func, /Bearer flowtoken/);
    });

test('backspace corrects a mistyped credential',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(
            ['findByStatus', '\r', 'tokenX', '\u007f', '\r'], PETSTORE);
        assert.match(text, /"authorization": `Bearer token`/);
    });

test('an empty valued credential header is offered for input',
    { skip: !openpty || !havePetstore }, () => {
        const text = throughPty(['store/inventory', '\r', 'thekey', '\r'], PETSTORE);
        assert.match(text, /Value for api_key/);
        assert.match(text, /"api_key": `thekey`/);
    });
