'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const SOURCES = {
    v2: 'https://raw.githubusercontent.com/openapitools/openapi-generator/master/modules/openapi-generator/src/test/resources/2_0/petstore.yaml',
    v3: 'https://raw.githubusercontent.com/swagger-api/swagger-petstore/master/src/main/resources/openapi.yaml'
};

const CACHE = path.join(os.tmpdir(), 'flowgen-spec-cache');

function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
    });
}

async function spec(version) {
    const url = SOURCES[version];
    if (!url) throw new Error('unknown spec: ' + version);
    fs.mkdirSync(CACHE, { recursive: true });
    const cached = path.join(CACHE, version + '.yaml');
    if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
    const text = await download(url);
    fs.writeFileSync(cached, text);
    return text;
}

async function specFile(version) {
    await spec(version);
    return path.join(CACHE, version + '.yaml');
}

module.exports = { SOURCES, spec, specFile };
