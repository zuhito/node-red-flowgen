# テストで使う API 定義ガイド

テストが読み込んでいる API 定義を、手元で再現・確認するための資料です。
どの定義がどこから来て、どんなエンドポイントを持ち、何を検証できるのかをまとめます。

対象バージョンは 0.15.0 です。

## まず試すなら

```bash
# 対話的にエンドポイントを選ぶ（上下キーで移動、文字を打つと絞り込み）
node-red-flowgen specs/ollama-openapi3.yaml

# 一覧を出す
node-red-flowgen specs/ollama-openapi3.yaml --list

# 1 つのエンドポイントのコードを出す
node-red-flowgen specs/ollama-openapi3.yaml post /api/chat

# Node-RED にそのまま読み込めるフローを出す
node-red-flowgen specs/ollama-openapi3.yaml post /api/chat --flow -o flow.json
```

`--list` の出力は `メソッド パス # 概要` の形なので、先頭 2 列をそのまま引数に貼れます。

## 定義の一覧

| 用途 | 定義 | 形式 | 取得元 |
|---|---|---|---|
| Ollama | `specs/ollama-openapi3.yaml` | OpenAPI 3.0.3 | リポジトリ同梱 |
| Ollama | `specs/ollama-swagger2.yaml` | Swagger 2.0 | リポジトリ同梱 |
| Ollama | `specs/ollama-bruno/` | Bruno | リポジトリ同梱 |
| 基本 | Petstore v2 | Swagger 2.0 | `https://petstore.swagger.io/v2/swagger.json` |
| 基本 | Petstore v3 | OpenAPI 3.0 | `https://petstore3.swagger.io/api/v3/openapi.json` |
| 認証 | httpbin | Swagger 2.0 | `https://httpbin.org/spec.json` |
| 認証 | httpbingo | OpenAPI 3.0.3 | `specs/httpbingo-openapi3.yaml` |
| Bruno | 111 コレクション | Bruno | GitHub（`BRUNO_SOURCES`） |
| コーパス | 93 定義 / 963 エンドポイント | Swagger 2.0 が 34、OpenAPI 3 が 59 | APIs.guru |

Petstore v2/v3 は `tests/specs.js` が実行時に取得し、`os.tmpdir()/flowgen-spec-cache/` に
キャッシュします。2 回目以降はネットワークに出ません。

## Ollama 定義（同梱、全機能を一通り試せる）

3 形式とも **同じ 17 エンドポイント**を表現しているので、
「OpenAPI 3 / Swagger 2 / Bruno で同じ結果になるか」を比べるのに向きます。

| エンドポイント | メソッド | 試せること |
|---|---|---|
| `/api/generate` | POST | 大きなリクエストボディ、必須と任意の出し分け、ネストした `options` |
| `/api/chat` | POST | 配列ボディ、`messages` の入れ子、`enum`（`role`） |
| `/api/embed`, `/api/embeddings` | POST | 単純なボディ |
| `/api/tags`, `/api/ps`, `/api/version` | GET | ボディなし、最小の生成結果 |
| `/api/show`, `/api/copy`, `/api/create` | POST | 必須フィールドのみ有効化 |
| `/api/delete` | DELETE | ボディ付き DELETE |
| `/api/pull`, `/api/push` | POST | `boolean` の既定値 |
| `/v1/chat/completions`, `/v1/completions` | POST | `max_tokens` の既定値 1000 |
| `/v1/models` | GET | OpenAI 互換 |
| `/v1/embeddings` | POST | OpenAI 互換 |

実際に動かすなら、Ollama を起動して軽量モデルを取得します。

```bash
ollama serve &
ollama pull gemma3:270m
node-red-flowgen specs/ollama-openapi3.yaml post /api/chat
```

`/api/embed` 系は `gemma3:270m` が埋め込み非対応のため 501/500 を返します。
テストでもこれはモデル側の制約として許容しています。

Bruno 版（`specs/ollama-bruno/`）は `environments/local.bru` に `baseUrl` と `model` を
定義しており、**変数がボディの中まで置換される**ことを確認できます。

```bash
node-red-flowgen specs/ollama-bruno post /api/chat
```

## Petstore v2（パスパラメータと認証の教材）

19 エンドポイントあり、生成結果の確認に最も使いやすい定義です。

```
put    /pet                       # Update an existing pet
post   /pet                       # Add a new pet to the store
get    /pet/findByStatus          # Finds Pets by status
get    /pet/{petId}               # Find pet by ID
post   /pet/{petId}               # Updates a pet in the store with form data
delete /pet/{petId}               # Deletes a pet
post   /pet/{petId}/uploadImage   # uploads an image
get    /store/inventory           # Returns pet inventories by status
post   /store/order               # Place an order for a pet
get    /store/order/{orderId}     # Find purchase order by ID
delete /store/order/{orderId}     # Delete purchase order by ID
post   /user                      # Create user
post   /user/createWithArray      # Creates list of users with given input array
post   /user/createWithList       # Creates list of users with given input array
get    /user/login                # Logs user into the system
get    /user/logout               # Logs out current logged in user session
get    /user/{username}           # Get user by user name
put    /user/{username}           # Updated user
delete /user/{username}           # Delete user
```

用途別に見ると次のとおりです。

**パスパラメータ** — `get /pet/{petId}` は型付きの案内コメントを出します。

```js
// Replace {petId} (integer) in the URL below with a real value.
msg.url = `http://petstore.swagger.io/v2/pet/{petId}`;
```

**クエリパラメータの候補列挙** — `get /pet/findByStatus` は `enum` の先頭を採用し、
残りをコメントアウトして並べます。`Ctrl + /` で切り替えられます。

```js
msg.url = "http://petstore.swagger.io/v2/pet/findByStatus?status=available";
// msg.url = "http://petstore.swagger.io/v2/pet/findByStatus?status=pending";
// msg.url = "http://petstore.swagger.io/v2/pet/findByStatus?status=sold";
```

**値の無いクエリ** — `get /user/login` は `enum` も `example` も無いため、
`{username}` `{password}` のプレースホルダになります。

**API キー認証** — `get /store/inventory` は `api_key` ヘッダを要求します。
公開のデモキー `special-key` が使えます。

**認証が 2 種類つく例** — `delete /pet/{petId}` は `api_key`（header パラメータ宣言）と
`petstore_auth`（oauth2 の security）の両方を持つため、ヘッダが 2 つ出ます。**これは正しい出力です。**

**multipart** — `post /pet/{petId}/uploadImage` は http request ノードのファイルアップロード
形式（`{ value: FILE_CONTENTS, options: { filename: FILENAME } }`）になります。

**formData** — `post /pet/{petId}` はフォーム形式のボディです。

手元で試すには次のようにします。

```bash
F=$(node -e "require('./tests/specs').specFile('v2').then(f=>console.log(f))")
node-red-flowgen "$F" --list
node-red-flowgen "$F" delete '/pet/{petId}'
```

パスに `{}` を含むので、シェルでは引用符が必要です。

## Petstore v3

同じ題材の OpenAPI 3 版です。`servers`、`requestBody`、`components/schemas` の
`$ref` 解決といった v3 固有の書き方を確認できます。
なお `/store/inventory` と `/pet/findByStatus` は公開デモサーバが 500 を返す状態が
続いており、テストでは上流障害として扱っています。

## httpbin / httpbingo（認証を実際に通す）

認証ヘッダを埋めて **実際に 200 が返ること**まで確認する用途です。

| エンドポイント | 埋める値 | 期待 |
|---|---|---|
| `/bearer` | `authorization: Bearer <任意>` | 200 |
| `/basic-auth/{user}/{passwd}` | `authorization: Basic <base64>` | 200 |
| `/hidden-basic-auth/{user}/{passwd}` | 同上 | 200 |
| `/status/{code}` | `code` に 204 など | 指定したコード |
| `/get`, `/post`, `/headers` | なし | 200 |

httpbin.org は不安定で 503 になることがあるため、同等の定義を
`specs/httpbingo-openapi3.yaml` として同梱しています。外部から定義を取得できなくても
認証経路のテストが必ず動くようにするためです。手元でもそのまま使えます。

```bash
node-red-flowgen specs/httpbingo-openapi3.yaml --list
node-red-flowgen specs/httpbingo-openapi3.yaml get '/basic-auth/{user}/{passwd}'
```

## Bruno コレクション（111 件）

`tests/test-live.js` の `BRUNO_SOURCES` に GitHub の公開リポジトリを列挙しています。
実行時に `git clone --depth 1` して全リクエストを生成し、検証します。

手元で試すには、そのまま git URL を渡せます。

```bash
node-red-flowgen https://github.com/bruno-collections/bruno-starter-guide.git --list
```

ディレクトリ、zip、単体の `.bru`、v2 形式の YAML も同じように渡せます。

```bash
node-red-flowgen ./my-collection --list
node-red-flowgen ./export.zip --list
node-red-flowgen ./request.bru
```

Bruno で確認できる主な事項は次のとおりです。

- `{{variable}}` の置換（URL・ヘッダ・**ボディの中まで**）
- `environments/` の変数、`collection.bru` の `vars`
- 未定義変数が `{name}` プレースホルダとして残ること
- 旧 `.bru` 形式と新しい v2 YAML 形式（`info:` + `http:`）の両対応
- 認証（`auth:bearer` / `auth:basic` ブロック、v2 形式の `http.auth` に `type` 指定）
- ボディ形式（json / text / form-urlencoded / multipart）
- `:id` 形式のパス変数が `{id}` に正規化されること

## APIs.guru コーパス（93 定義 / 963 エンドポイント）

実在の公開 API を広く当てるための集合です。Swagger 2.0 が 34、OpenAPI 3 が 59 件で、
1 件あたり 1〜30 エンドポイントです。

**選定条件** — 認証宣言が無く、生成コードに認証ヘッダが現れず、URL にプレースホルダが
残らない定義から、ホストが重複しないよう選んでいます。

**1 定義あたり 30 エンドポイントまで**に制限しています。無制限にすると Microsoft Graph
だけで 21,807 エンドポイント、全体で 54,816 エンドポイントとなり、実行が現実的でないためです。
この上限は実行時にも確認しており、超える定義は自動的にスキップします。

**実行方法** — 通常の live テストとは分けてあり、環境変数で有効にします。

```bash
LIVE_CORPUS=1 npm run test:live
```

**判定の考え方** — 定義ごとに、まず全エンドポイントを `curl` で叩きます。
このとき **各エンドポイント本来のメソッド**（POST なら POST）を使います。
1 つでも応答が無ければその定義は丸ごと対象外にします。全て到達できた定義だけ、
その全エンドポイントを Node-RED 経由で実行します。

curl で到達できたのに Node-RED から無応答なら、生成側の問題として**失敗**にします。
HTTP ステータス自体は 4xx でも問題としません。認証が必要な API が 401 や 403 を返すのは
リクエストが正しく届いた証拠だからです。

定義の一覧は `tests/test-live.js` の `CORPUS_SPECS` にあり、
`https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/<パス>` から取得します。

```bash
node-red-flowgen https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/apis.guru/2.2.0/openapi.yaml --list
```

## 生成結果の読み方

編集が必要な箇所には必ず直前にコメントが付きます。

```js
msg.method = "DELETE";

// Replace {petId} (integer) in the URL below with a real value.
msg.url = `http://petstore.swagger.io/v2/pet/{petId}`;

// Fill in "api_key" (string) and "authorization" below.
msg.headers = {
    "api_key": `{api_key}`,
    "authorization": `Bearer {token}`,
    "accept": "application/json"
};
return msg;
```

- 値が確定しているものは `"..."`、`{変数}` を含むものは `` `...` ``（テンプレートリテラル）
- 定義に `example` / `default` / `enum` があればその値が入る
- 任意フィールドはコメントアウトされ、必須フィールドだけが有効

## テストの実行

```bash
npm test              # 生成・CLI・Bruno
npm run test:ui       # jsdom で import ダイアログを操作
npm run test:nodered  # 埋め込み Node-RED で実行
npm run test:plugin   # npm pack して実際に install
npm run test:browser  # 実ブラウザ（BROWSERS=chromium,firefox,webkit,msedge）
npm run test:wizard   # 擬似端末で対話ウィザード
npm run test:live     # 公開 API へ実際にアクセス
npm run test:ollama   # Ollama サーバへ実際にアクセス
```

`test:live` と `test:ollama` はネットワーク（と Ollama）が必要です。
`test:ollama` は `OLLAMA_URL` と `OLLAMA_MODEL` で接続先とモデルを差し替えられます。
