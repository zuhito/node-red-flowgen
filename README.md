# node-red-flowgen

Generate [Node-RED](https://nodered.org/) flows from OpenAPI 3.x / Swagger 2.0 documents.

Pick an endpoint from an API definition and get a ready-to-run flow — inject, function,
http request and debug — where the function node sets up `msg` for the request: method, URL,
headers, cookies and a sample body. Works as an editor plugin that adds an
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

1. Open "Import nodes" dialog by selecting "Import" item from the menu.
   <img width="1470" height="956" alt="menu" src="https://github.com/user-attachments/assets/7d52eb2c-3099-4cd8-acd4-67897f63005c" />

2. Select "API Spec" tab and Paste an API document (JSON or YAML), paste its URL, or upload a file.
   <img width="1470" height="956" alt="import" src="https://github.com/user-attachments/assets/64477939-84a5-4ded-8bdd-124469a2f038" />

3. One endpoint → **Import** lights up immediately. Several → press **Select endpoint >**,
   pick one from the Swagger-UI-style list (arrow keys work), then **Import**.
   <img width="1470" height="956" alt="endpoints" src="https://github.com/user-attachments/assets/05e317b9-3251-449e-8af6-0f70582ad266" />

4. The four nodes are added to the current flow.
   <img width="1470" height="956" alt="flow" src="https://github.com/user-attachments/assets/9f5ae630-16cd-4f4a-b941-e08b6b0e699c" />

## Generated code for function node
```JavaScript
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

## CLI

The source can be an OpenAPI/Swagger file or URL, or a [Bruno](https://www.usebruno.com/)
collection — a folder, an exported zip, a single `.bru`/YAML request file, or a git URL:

```bash
node-red-flowgen https://github.com/bruno-collections/bruno-starter-guide.git --list
node-red-flowgen ./my-collection.zip --list
```

