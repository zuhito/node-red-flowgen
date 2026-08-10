'use strict';

// Checks the floor declared in package.json against a real editor in one
// browser. Run by CI once per engine.
//
// Two things have to hold, and only checking the first would let the declared
// floor drift upward unnoticed:
//   - the declared floor works
//   - the release below it does not (or is outside what Node-RED supports)

const { execFileSync } = require('child_process');
const { works } = require('./find-node-floor');

const declared = require('../package.json').engines.node.replace(/^[^0-9]*/, '');
const engine = process.env.BROWSERS || 'chromium';

function previousRelease(version) {
    const all = JSON.parse(execFileSync('npm', ['view', 'node', 'versions', '--json'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const stable = all.filter(entry => !/-/.test(entry));
    const at = stable.indexOf(version);
    return at > 0 ? stable[at - 1] : null;
}

let failed = false;

function fail(message) {
    process.stdout.write('::error::' + message + '\n');
    failed = true;
}

(async () => {
    process.stdout.write('declared floor ' + declared + ', browser ' + engine + '\n');

    const atFloor = await works(declared);
    process.stdout.write('  ' + declared + ' -> ' +
        (atFloor.ok ? 'works' : 'FAILS: ' + atFloor.why) + '\n');
    if (!atFloor.ok) {
        fail('node ' + declared + ' is declared supported but the editor does not ' +
            'work there in ' + engine + ': ' + atFloor.why);
        return;
    }

    // Below the floor is only meaningful while Node-RED still supports it.
    const below = previousRelease(declared);
    if (!below) {
        process.stdout.write('  nothing below ' + declared + ' to check\n');
        return;
    }

    const redEngines = JSON.parse(execFileSync('npm',
        ['view', 'node-red@' + (process.env.RED_VERSION || 'latest'), 'engines', '--json'],
        { encoding: 'utf8' }));
    const redFloor = String(redEngines.node || '').match(/(\d+)(?:\.(\d+))?/);
    const redMajor = redFloor ? Number(redFloor[1]) : 0;
    const redMinor = redFloor ? Number(redFloor[2] || 0) : 0;
    const [belowMajor, belowMinor] = below.split('.').map(Number);
    if (belowMajor < redMajor || (belowMajor === redMajor && belowMinor < redMinor)) {
        process.stdout.write('  ' + below + ' is below what Node-RED itself supports, ' +
            'so the floor cannot go lower\n');
        return;
    }

    const under = await works(below);
    process.stdout.write('  ' + below + ' -> ' +
        (under.ok ? 'works' : 'fails: ' + under.why) + '\n');
    if (under.ok) {
        fail('node ' + below + ' also runs the editor in ' + engine +
            ', so the declared floor of ' + declared + ' is higher than it needs to be');
    }
})().catch(err => {
    fail('the floor check crashed: ' + String((err && err.stack) || err));
}).then(() => {
    // Exit explicitly: a browser or a spawned Node-RED can leave the loop
    // alive, and an exit code set on a process that never exits is not a
    // failure CI will notice.
    process.exit(failed ? 1 : 0);
});
