# node-red-flowgen

Generate [Node-RED](https://nodered.org/) flows and function-node code from OpenAPI 3.x and Swagger 2.0 documents.

Given an API description, `flowgen.js` emits the JavaScript that sets up `msg` for the
[http request node](https://nodered.org/docs/user-guide/nodes#http-request) — method, URL, headers,
cookies and a sample request body — or a complete flow ready to import into the editor.

## Install

```bash
npm install
```

The only runtime dependency is `js-yaml`, so JSON and YAML documents are both accepted.

## Usage

List the operations in a document:

```bash
node flowgen.js spec/petstore-v3.yaml --list
```

```
put /pet                       # Update an existing pet.
post /pet                      # Add a new pet to the store.
get /pet/findByStatus          # Finds Pets by status.
get /pet/{petId}               # Find pet by ID.
delete /pet/{petId}            # Deletes a pet.
...
```

Generate the function-node code for one operation. The first two columns of the list are the
arguments, so a line can be pasted as-is:

```bash
node flowgen.js spec/petstore-v3.yaml get '/pet/{petId}'
```

```js
// Returns a single pet.
msg.method = 'GET';
msg.url = 'https://petstore3.swagger.io/api/v3/pet/{petId}';
msg.headers = {
  'api_key': '',
  'accept': 'application/json'
};
return msg;
```

Generate a complete flow — inject, function, http request and debug — for import into Node-RED:

```bash
node flowgen.js spec/petstore-v3.yaml get '/pet/{petId}' --flow > flows.json
```

Every node except the function node keeps its default properties. The http request node uses
`method: "use"` so that `msg.method` is honoured; its URL is left empty so that `msg.url` is used.

Paths containing `{...}` need quoting in the shell.

## Output

Placeholders are left empty on purpose — fill in the values before running the flow:

- **Path parameters** stay in their `{name}` form inside the URL.
- **Query parameters** are appended as `?a=&b=` in the order declared.
- **Header and cookie parameters** become keys with empty values.
- **Authentication** is derived from `security`: API keys land in the header, query or cookie
  according to their definition; HTTP basic, bearer, OAuth2 and OpenID Connect produce an
  `authorization` header with the appropriate prefix.
- **Request bodies** are sampled from the schema, honouring `example`, `default`, `enum`, `allOf`,
  `oneOf`/`anyOf` and nested objects. Recursive `$ref`s terminate at the cycle.
- `GET` and `HEAD` never carry a body.

## API

```js
const flowgen = require('./flowgen');

const doc = flowgen.parseDocument(fs.readFileSync('spec/petstore-v3.yaml', 'utf8'));

flowgen.detectFormat(doc);                        // 'openapi3' | 'swagger2'
flowgen.listOperations(doc);                      // { format, count, operations: [...] }
flowgen.generate(doc, 'get', '/pet/{petId}');     // function-node source, as a string
flowgen.buildFlow(doc, 'get', '/pet/{petId}');    // array of Node-RED nodes
```

`generateOpenApi3` and `generateSwagger2` are exported as well; `generate` dispatches to them after
`detectFormat`. The two are deliberately independent so that another document format can be added
without disturbing the existing ones.

## Node-RED editor plugin

Installing the module into a Node-RED instance adds an **API Spec** tab to the import dialog,
alongside Clipboard, Local and Examples:

```bash
cd ~/.node-red
npm install node-red-flowgen
```

Restart Node-RED, then choose *Import* from the menu and select the **API Spec** tab. Upload a
document or paste one into the text area, pick an endpoint from the list and press
*Import selected endpoint*. The inject, function, http request and debug nodes are added to the
current flow, or to a new one if *new flow* is selected.

The plugin is frontend only: it loads the same `flowgen.js` used by the command line, so the
generated code is identical either way. The runtime half of the plugin does nothing but serve
`flowgen.js` and the js-yaml browser build to the editor.

## Prebuilt tarball

The easiest download is the [latest release](../../releases/latest), which carries
`node-red-flowgen.tgz` as a plain asset — no zip involved:

```bash
cd ~/.node-red
npm install /path/to/node-red-flowgen.tgz
```

Every CI run also uploads the same tarball as a build artifact. GitHub always serves *artifacts*
as a zip, so that download arrives as `node-red-flowgen.zip` with `node-red-flowgen.tgz` inside.
Note that the **Code → Download ZIP** button on the repository home page is something different
again: it contains the source only, never the tarball.

## Tests

```bash
npm test              # unit tests plus every Petstore v2 and v3 operation
npm run test:nodered  # loads generated flows into an embedded Node-RED instance
npm run test:plugin   # packs the module, installs it and checks the plugin loads
npm run test:live     # calls the real Petstore API through Node-RED (needs internet)
npm run test:all
```

The integration suite starts Node-RED in-process, points the generated code at a local recording
server and asserts on the request that actually arrives — method, path, query string, headers,
cookies and body.

`npm run test:live` runs in CI against the public Petstore server. It fails on a 4xx, which
would mean the generated request was malformed, and reports a 5xx as an upstream fault — the
demo server currently returns 500 for `/store/inventory` and `/pet/findByStatus` even for a bare
request with no headers at all, so those responses say nothing about the generated code.

The plugin suite runs `npm pack`, installs the resulting tarball into a temporary Node-RED
instance and checks that the plugin markup reaches the editor, that `flowgen.js` is served
unchanged and that it still works when evaluated as browser code.

## License

MIT
