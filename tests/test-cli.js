'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { execFile, execFileSync } = require('child_process');
const specs = require('./specs');

let server, base;

const run = (args, env) => new Promise(resolve =>
    execFile('node', [path.join(__dirname, '..', 'flowgen.js')].concat(args),
        env ? { env: Object.assign({}, process.env, env) } : {},
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

// Counting flowgen-git-* under the shared temp directory sees clones made by
// whatever else is running at the same time, and the suites run in parallel.
// Each of these tests gets a temp directory of its own so the count is its own.
function privateTmp(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-tmp-' + name + '-'));
    return {
        dir: dir,
        env: { TMPDIR: dir, TMP: dir, TEMP: dir },
        clones: () => fs.readdirSync(dir).filter(n => n.startsWith('flowgen-git-')),
        clean: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
    };
}

before(async () => {
    const spec = JSON.stringify(yaml.load(await specs.spec('v2')));
    server = http.createServer((req, res) => {
        if (req.url === '/redirect') {
            res.writeHead(302, { location: '/swagger.json' });
            return res.end();
        }
        if (req.url === '/swagger.json') {
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(spec);
        }
        res.writeHead(404).end('nope');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

test('a url can be given instead of a file', async () => {
    const listed = await run([base + '/swagger.json', '--list']);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /post \/pet/);

    const code = await run([base + '/swagger.json', 'get', '/pet/findByStatus']);
    assert.strictEqual(code.code, 0, code.stderr);
    assert.match(code.stdout, /msg\.url = "http:\/\/petstore\.swagger\.io\/v2\/pet\/findByStatus\?status=available";/);
});

test('redirects are followed', async () => {
    const result = await run([base + '/redirect', '--list']);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /post \/pet/);
});

test('a failing url reports the status and exits non zero', async () => {
    const result = await run([base + '/missing', '--list']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /HTTP 404/);
});

test('--flow works from a url too', async () => {
    const result = await run([base + '/swagger.json', 'get', '/pet/findByStatus', '--flow']);
    assert.strictEqual(result.code, 0, result.stderr);
    const flow = JSON.parse(result.stdout);
    assert.strictEqual(flow.map(n => n.type).join(','), 'tab,inject,function,http request,debug');
});

test('the usage text is printed with no arguments and exits non zero', async () => {
    const result = await run([]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /usage:/);
    assert.match(result.stderr, /node-red-flowgen <spec/);
    assert.ok(!/node flowgen\.js/.test(result.stderr), 'the CLI advertises its installed name');
});

test('an unknown path lists the available operations', async () => {
    const file = await specs.specFile('v2');
    const result = await run([file, 'get', '/nope']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /not found/);
    assert.match(result.stderr, /available:/);
    assert.match(result.stderr, /get \/store\/inventory/);
});

test('a missing file reports an error rather than throwing', async () => {
    const result = await run(['/nonexistent/spec.yaml', '--list']);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /ENOENT|no such file/i);
});

test('an unparsable document is reported clearly', async () => {
    const file = path.join(os.tmpdir(), 'bad-' + process.pid + '.yaml');
    fs.writeFileSync(file, 'just: a\nplain: mapping\n');
    const result = await run([file, '--list']);
    fs.unlinkSync(file);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /unknown format|no requests/);
});

test('--list output lines can be fed straight back as arguments', async () => {
    const file = await specs.specFile('v3');
    const listed = await run([file, '--list']);
    assert.strictEqual(listed.code, 0);

    const lines = listed.stdout.trim().split('\n').filter(Boolean);
    assert.ok(lines.length > 5);
    for (const line of lines.slice(0, 6)) {
        const [method, target] = line.replace(/\s*#.*/, '').trim().split(/\s+/);
        const generated = await run([file, method, target]);
        assert.strictEqual(generated.code, 0, line + ' -> ' + generated.stderr);
        assert.match(generated.stdout, /^msg\.method = "/);
        assert.match(generated.stdout, /return msg;/);
    }
});

test('the short flags behave like the long ones', async () => {
    const file = await specs.specFile('v2');
    const long = await run([file, '--list']);
    const short = await run([file, '-l']);
    assert.strictEqual(short.stdout, long.stdout);

    const flowLong = await run([file, 'get', '/store/inventory', '--flow']);
    const flowShort = await run([file, 'get', '/store/inventory', '-f']);
    assert.strictEqual(flowShort.stdout, flowLong.stdout);
});

test('deprecated operations are refused by the CLI', async () => {
    const file = await specs.specFile('v2');
    const listed = await run([file, '--list']);
    assert.ok(!/findByTags/.test(listed.stdout));
    const result = await run([file, 'get', '/pet/findByTags']);
    assert.strictEqual(result.code, 1);
    assert.ok(!/findByTags/.test(result.stderr.split('available:')[1] || ''));
});

test('a single bru file can be given to the CLI', async () => {
    const file = path.join(os.tmpdir(), 'one-' + process.pid + '.bru');
    fs.writeFileSync(file, [
        'meta {', '  name: Ping', '}', '',
        'get {', '  url: https://api.example.test/ping', '}', ''
    ].join('\n'));

    const listed = await run([file, '--list']);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /get \/ping\s+# Ping/);

    const generated = await run([file, 'get', '/ping']);
    fs.unlinkSync(file);
    assert.strictEqual(generated.code, 0, generated.stderr);
    assert.match(generated.stdout, /msg\.url = "https:\/\/api\.example\.test\/ping";/);
});

test('a git source leaves no temporary directory behind', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-git-'));
    fs.writeFileSync(path.join(repo, 'r.yml'),
        'info:\n  name: R\nhttp:\n  method: GET\n  url: https://t.test/r\n');
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '-A']);
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t',
        'commit', '-qm', 'x']);
    execFileSync('git', ['-C', repo, 'update-server-info']);

    const tmp = privateTmp('git');
    const before = tmp.clones();
    const listed = await run([path.join(repo, '.git'), '--list'], tmp.env);
    const after = tmp.clones();

    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    tmp.clean();
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /get \/r/);
    assert.strictEqual(after.join(','), before.join(','),
        'the clone directory must be removed once the source is read');
});

test('a failed clone still removes its temporary directory', async () => {
    const tmp = privateTmp('clone');
    const before = tmp.clones();
    const result = await run(['http://127.0.0.1:1/nope.git', '--list'], tmp.env);
    const after = tmp.clones();
    tmp.clean();

    assert.strictEqual(result.code, 1);
    assert.strictEqual(after.join(','), before.join(','),
        'a failure must not leak the clone directory');
});

test('--output writes the list as well as generated code', async () => {
    const file = await specs.specFile('v2');
    const target = path.join(os.tmpdir(), 'out-' + process.pid, 'nested', 'list.txt');
    fs.rmSync(path.dirname(path.dirname(target)), { recursive: true, force: true });

    const listed = await run([file, '--list', '--output', target]);
    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stderr, /written /);
    assert.strictEqual(listed.stdout, '', 'nothing goes to stdout when a file is given');
    assert.match(fs.readFileSync(target, 'utf8'), /get \/store\/inventory/);

    fs.rmSync(path.dirname(path.dirname(target)), { recursive: true, force: true });
});

test('--output creates missing parent directories', async () => {
    const file = await specs.specFile('v2');
    const root = path.join(os.tmpdir(), 'outdeep-' + process.pid);
    const target = path.join(root, 'a', 'b', 'c', 'code.js');
    fs.rmSync(root, { recursive: true, force: true });

    const result = await run([file, 'get', '/store/inventory', '--output', target]);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(fs.existsSync(target));
    assert.match(fs.readFileSync(target, 'utf8'), /^msg\.method = "GET";/);

    fs.rmSync(root, { recursive: true, force: true });
});

test('--output overwrites an existing file without asking', async () => {
    const file = await specs.specFile('v2');
    const target = path.join(os.tmpdir(), 'overwrite-' + process.pid + '.js');
    fs.writeFileSync(target, 'previous contents\n');

    const result = await run([file, 'get', '/store/inventory', '-o', target]);
    const written = fs.readFileSync(target, 'utf8');
    fs.rmSync(target, { force: true });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(!/previous contents/.test(written));
    assert.match(written, /store\/inventory/);
});

test('--output=file is accepted as one argument', async () => {
    const file = await specs.specFile('v2');
    const target = path.join(os.tmpdir(), 'inline-' + process.pid + '.js');
    fs.rmSync(target, { force: true });

    const result = await run([file, 'get', '/store/inventory', '--output=' + target]);
    const exists = fs.existsSync(target);
    const body = exists ? fs.readFileSync(target, 'utf8') : '';
    fs.rmSync(target, { force: true });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(exists, 'the inline form must write the file too');
    assert.match(body, /store\/inventory/);
});

test('--output works together with --flow', async () => {
    const file = await specs.specFile('v2');
    const target = path.join(os.tmpdir(), 'flow-' + process.pid + '.json');
    fs.rmSync(target, { force: true });

    const result = await run([file, 'get', '/store/inventory', '--flow', '-o', target]);
    const flow = JSON.parse(fs.readFileSync(target, 'utf8'));
    fs.rmSync(target, { force: true });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(flow.map(n => n.type).join(','),
        'tab,inject,function,http request,debug');
});

test('a directory of Bruno files can be given to the CLI', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brudir-'));
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, 'nested', 'ping.bru'),
        'meta {\n  name: Ping\n}\n\nget {\n  url: https://api.example.test/ping\n}\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

    const listed = await run([dir, '--list']);
    fs.rmSync(dir, { recursive: true, force: true });

    assert.strictEqual(listed.code, 0, listed.stderr);
    assert.match(listed.stdout, /get \/ping\s+# Ping/);
});
