'use strict';

// For every API definition in tests/specs, produces the two formats it is not
// already in, using the published converters rather than hand translation:
//
//   Swagger 2  --swagger2openapi-->  OpenAPI 3
//   OpenAPI 3  --@usebruno/converters-->  Bruno
//   Bruno      --@usebruno/converters-->  Postman  --postman-to-openapi-->  OpenAPI 3
//   OpenAPI 3  --swagger2openapi (down)-->  not available, so v2 is written by
//                                           hand only where a source v2 exists
//
// Run with: node tests/generate-formats.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const s2o = require('swagger2openapi');
const { openApiToBruno } = require('@usebruno/converters');

const SPECS = path.join(__dirname, 'specs');
const GENERATED = path.join(SPECS, 'generated');

function readCollection(dir) {
    const files = [];
    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) { walk(full); }
            else if (/\.bru$/.test(entry.name)) {
                files.push({ path: path.relative(dir, full), text: fs.readFileSync(full, 'utf8') });
            }
        }
    };
    walk(dir);
    return files;
}

async function fromSwagger2(doc) {
    const converted = await s2o.convertObj(doc, { patch: true, warnOnly: true });
    return converted.openapi;
}

// Bruno carries no schema, so there is no published converter back to
// OpenAPI. flowgen already parses a collection into method, url, headers and
// body, which is exactly what an OpenAPI operation needs, so the description
// is rebuilt from that rather than routed through Postman.
function fromBruno(dir, name) {
    const flowgen = require('../flowgen');
    const collection = flowgen.parseCollection(readCollection(dir));
    const requests = collection.requests || [];

    let origin = 'https://api.example.test';
    const paths = {};
    for (const request of requests) {
        const filled = String(request.url || '')
            .replace(/\{\{\s*baseUrl\s*\}\}/g, origin)
            .replace(/\{\{\s*([\w-]+)\s*\}\}/g, '{$1}');
        let route = filled;
        try {
            const parsed = new URL(filled);
            origin = parsed.origin;
            route = parsed.pathname;
        } catch (err) {
            route = filled.replace(/^https?:\/\/[^/]*/, '') || '/';
        }

        const method = String(request.method || 'get').toLowerCase();
        const operation = {
            summary: request.name || route,
            responses: { 200: { description: 'ok' } }
        };

        const parameters = [];
        for (const [header, value] of request.headers || []) {
            if (/^(accept|content-type)$/i.test(header)) { continue; }
            parameters.push({
                name: header, in: 'header', required: false,
                schema: { type: 'string', example: String(value) }
            });
        }
        for (const match of route.matchAll(/\{([^}]+)\}/g)) {
            parameters.push({
                name: match[1], in: 'path', required: true, schema: { type: 'string' }
            });
        }
        if (parameters.length) { operation.parameters = parameters; }

        if (request.hasBody) {
            operation.requestBody = {
                required: true,
                content: { 'application/json': { schema: schemaOf(request.payload) } }
            };
        }

        paths[route] = paths[route] || {};
        paths[route][method] = operation;
    }

    return {
        openapi: '3.0.3',
        info: { title: name, version: '1.0.0' },
        servers: [{ url: origin }],
        paths: paths
    };
}

// A value is all Bruno gives, so the schema is inferred from it and the value
// is kept as the example. Everything is marked required: Bruno does not record
// which fields are optional, and dropping that distinction is visible in the
// generated code, so it must not be invented here.
function schemaOf(value) {
    if (Array.isArray(value)) {
        return {
            type: 'array',
            items: value.length ? schemaOf(value[0]) : { type: 'string' },
            example: value
        };
    }
    if (value && typeof value === 'object') {
        const properties = {};
        for (const key of Object.keys(value)) { properties[key] = schemaOf(value[key]); }
        return {
            type: 'object',
            required: Object.keys(value),
            properties: properties
        };
    }
    if (typeof value === 'number') {
        return { type: Number.isInteger(value) ? 'integer' : 'number', example: value };
    }
    if (typeof value === 'boolean') { return { type: 'boolean', example: value }; }
    return { type: 'string', example: value === undefined ? '' : String(value) };
}

async function main() {
    fs.mkdirSync(GENERATED, { recursive: true });
    const written = [];

    for (const entry of fs.readdirSync(SPECS, { withFileTypes: true })) {
        const name = entry.name;
        const full = path.join(SPECS, name);
        if (name === 'generated') { continue; }

        let openapi = null;
        let base = null;

        if (entry.isFile() && /\.ya?ml$/.test(name)) {
            const doc = yaml.load(fs.readFileSync(full, 'utf8'));
            // The source format stays in the name: three inputs for one API
            // must not overwrite each other, and which one a file came from is
            // exactly what the comparison test needs to know.
            base = name.replace(/\.ya?ml$/, '');
            if (doc.swagger === '2.0') { openapi = await fromSwagger2(doc); }
            else if (doc.openapi) { openapi = doc; }
        } else if (entry.isDirectory() && /bruno/.test(name)) {
            base = name;
            openapi = fromBruno(full, base);
        }

        if (!openapi) { continue; }

        const asOpenApi = path.join(GENERATED, base + '-openapi3.generated.yaml');
        fs.writeFileSync(asOpenApi, yaml.dump(openapi, { lineWidth: 100 }));
        written.push(path.relative(SPECS, asOpenApi));

        const bruno = openApiToBruno(yaml.dump(openapi));
        const asBruno = path.join(GENERATED, base + '-bruno.generated.json');
        fs.writeFileSync(asBruno, JSON.stringify(bruno, null, 2));
        written.push(path.relative(SPECS, asBruno));
    }

    process.stdout.write('wrote:\n  ' + written.join('\n  ') + '\n');
}

main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
});
