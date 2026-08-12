# node-red-flowgen

Generate [Node-RED](https://nodered.org/) flows from OpenAPI 3.x / Swagger 2.0 documents.

Pick an endpoint from an API definition and get a ready-to-run flow — inject, function,
http request and debug — where the function node sets up `msg` for the request: method, URL,
headers, cookies and a sample body. It works as an editor plugin that adds an
**API Spec** tab to the Import dialog.

## Install

```bash
cd ~/.node-red
npm install node-red-flowgen
```

Or grab `node-red-flowgen.tgz` from the [latest release](../../releases/latest) and
`npm install ./node-red-flowgen.tgz`. Restart Node-RED afterwards. Once installed, the
plugin works fully offline — every asset is served by Node-RED itself.

## How to use editor plugin
1. Open **Import node** dialog by selecting **Import** item from the menu.
   <img alt="menu" src="https://github.com/user-attachments/assets/e93fc538-2bed-48d2-adbe-0017572f9a3d" />

2. Select **API Spec** tab, then paste an API document (JSON or YAML), paste its URL, or upload a file.
   <img alt="import" src="https://github.com/user-attachments/assets/f1726ea3-51ad-4ae8-9ca9-bc553a3e8fd3" />

3. One endpoint → **Import** lights up immediately. Several → press **Select endpoint >**,
   pick one from the Swagger-UI-style list (arrow keys work), then **Import**.
   <img alt="endpoints" src="https://github.com/user-attachments/assets/c1d8da0c-e080-4580-87e7-fe7ca3d27f19" />

4. The four nodes are added to the current flow.
   <img alt="flow" src="https://github.com/user-attachments/assets/334024dc-c8c7-4917-8cb1-4cd3aa773b52" />

## Generated code for function node
```JavaScript
msg.method = "GET";
msg.url = "https://petstore.swagger.io/v2/pet/findByStatus?status=available";
// msg.url = "https://petstore.swagger.io/v2/pet/findByStatus?status=pending";
// msg.url = "https://petstore.swagger.io/v2/pet/findByStatus?status=sold";

// Replace {token} below with a real value.
msg.headers = {
    "authorization": `Bearer {token}`,
    "accept": "application/json"
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
