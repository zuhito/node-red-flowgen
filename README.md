# node-red-flowgen

Generate [Node-RED](https://nodered.org/) flows from OpenAPI 3.x / Swagger 2.0 documents.

Pick an endpoint from an API definition and get a ready-to-run flow — inject, function,
http request and debug — where the function node sets up `msg` for the request: method, URL,
headers, cookies and a sample body. Works as a CLI and as an editor plugin that adds an
**API Spec** tab to the Import dialog.

## Install

```bash
cd ~/.node-red
npm install node-red-flowgen
```

Or grab `node-red-flowgen.tgz` from the [latest release](../../releases/latest) and
`npm install ./node-red-flowgen.tgz`. Restart Node-RED afterwards. Once installed, the
plugin works fully offline — every asset is served by Node-RED itself.

## Editor plugin

Open *Import* in the editor and switch to the **API Spec** tab:

1. Paste an API document (JSON or YAML), paste its URL, or upload a file.
2. One endpoint → **Import** lights up immediately. Several → press **Select endpoint >**,
   pick one from the Swagger-UI-style list (arrow keys work), then **Import**.
3. The four nodes are added to the current flow. No new tab, no reload.

## CLI

```bash
node flowgen.js <spec.json|spec.yaml|url> --list            # list endpoints
node flowgen.js <spec> <method> <path>                      # function-node code
node flowgen.js <spec> <method> <path> --flow > flows.json  # complete importable flow
```

Example:

```bash
$ node flowgen.js petstore.yaml get /pet/findByStatus
msg.method = 'GET';
msg.url = 'http://petstore.swagger.io/v2/pet/findByStatus?status=available';
// msg.url = 'http://petstore.swagger.io/v2/pet/findByStatus?status=pending';
// msg.url = 'http://petstore.swagger.io/v2/pet/findByStatus?status=sold';

// Fill in 'authorization' below.
msg.headers = {
  'authorization': 'Bearer ',
  'accept': 'application/json'
};
return msg;
```

## Generated code

- Parameter values are filled from the spec (`enum`, `example`, `default`). The first
  candidate goes into `msg.url`; alternatives follow as commented-out lines, so `Ctrl + /`
  toggles between them.
- Anything the spec leaves open gets a comment saying what to edit, with the type when
  known: `// Replace {petId} (integer) in the URL below with a real value.`
- Authentication comes from the security definitions: API keys in header/query/cookie,
  `Bearer ` / basic prefixes in `authorization`.
- `multipart/form-data` bodies use the http request node's file-upload shape
  (`{ value: FILE_CONTENTS, options: { filename: FILENAME } }`).
- Deprecated operations are hidden everywhere.

## API

```js
const flowgen = require('node-red-flowgen');

const doc = flowgen.parseDocument(text);       // JSON or YAML
flowgen.listOperations(doc);                   // { format, count, operations }
flowgen.generate(doc, 'get', '/pet/{petId}');  // function-node source
flowgen.buildFlow(doc, 'get', '/pet/{petId}'); // nodes wrapped in a tab
flowgen.buildFlow(doc, 'get', '/pet/{petId}', { tab: false }); // nodes only
```

## Tests

```bash
npm test              # generation + CLI
npm run test:ui       # drives the import dialog in jsdom
npm run test:nodered  # runs generated flows in an embedded Node-RED
npm run test:plugin   # packs, installs and checks the plugin end to end
npm run test:all
```

The suites live in `tests/` and are not shipped in the package. Petstore documents are
fetched on demand and cached in the system temp directory. CI also calls the public
Petstore API through Node-RED and publishes `node-red-flowgen.tgz` on every release.

## Requirements

Node.js 22.9 or newer (matching Node-RED 5).

## License

Apache-2.0
