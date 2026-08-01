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

## Tests

```bash
npm test              # unit tests plus every Petstore v2 and v3 operation
npm run test:nodered  # loads generated flows into an embedded Node-RED instance
npm run test:all
```

The integration suite starts Node-RED in-process, points the generated code at a local recording
server and asserts on the request that actually arrives — method, path, query string, headers,
cookies and body.

## License

MIT
