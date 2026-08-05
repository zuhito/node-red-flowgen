# 実装メモ

node-red-flowgen がローカルファイルシステムをどう扱い、どのエンドポイントを公開し、
それらが認証によってどう保護されるかをまとめます。対象バージョンは 0.10.0 です。

## 全体像

本モジュールは 2 つの顔を持ちます。

| 実行形態 | 実体 | 権限 |
|---|---|---|
| CLI | `node-red-flowgen` コマンド | コマンドを実行したユーザー |
| エディタプラグイン | `flowgen-plugin.js`（ランタイム）と `flowgen-plugin.html`（ブラウザ側） | Node-RED プロセスのユーザー |

フローの生成そのものは `flowgen.js` が行い、CLI とブラウザで同一のコードを共有します。
ブラウザ側はランタイムから配信された `flowgen.js` を読み込んで実行するため、
**プラグイン経由の生成処理はサーバのファイルシステムに一切触れません**。

## CLI が読み書きするパス

### 読み取り

`node-red-flowgen <ソース>` の `<ソース>` は次のいずれかです。

- **ファイル** — 相対パスはカレントディレクトリ基準で解決します
- **ディレクトリ** — Bruno コレクションとして再帰的に走査します
- **zip ファイル** — メモリ上で展開し、ディスクには書き出しません
- **http(s) URL** — 取得のみ
- **`.git` で終わる URL** — 一時ディレクトリへ clone します

走査対象は拡張子が `.bru` / `.yaml` / `.yml` / `.json` のファイルのみで、
`.git` と `node_modules` は除外します。

### 書き込み

書き込みは次の 2 か所だけです。

**1. `--output <ファイル>` で指定した出力先**

指定が無ければ標準出力にのみ書き、ファイルは作りません。指定した場合は親ディレクトリを
`recursive: true` で作成したうえで上書きします。**確認プロンプトは出ません。**

```bash
node-red-flowgen petstore.yaml get /pet/1 --output ./out/pet.js
node-red-flowgen petstore.yaml get /pet/1 --flow -o ./out/flow.json
```

**2. git clone 用の一時ディレクトリ**

`os.tmpdir()` の下に `flowgen-git-XXXXXX` を作成し、処理後に削除します。

| OS | `os.tmpdir()` の既定値 | 実際に作られる例 |
|---|---|---|
| Ubuntu / Linux | `/tmp` | `/tmp/flowgen-git-a1b2c3` |
| macOS | `$TMPDIR`（例 `/var/folders/xx/…/T`） | `/var/folders/q7/…/T/flowgen-git-a1b2c3` |
| Windows | `%TEMP%`（例 `C:\Users\<user>\AppData\Local\Temp`） | `C:\Users\<user>\AppData\Local\Temp\flowgen-git-a1b2c3` |

いずれの OS でもパスは `path.join` で組み立てるため、Windows では `\` 区切りになります。
生成コード内のパス表記（URL のパス）は OS に依存しません。

## プラグインが読み書きするパス

### 読み取り専用のパス

`GET /flowgen/:asset` が返すのは、あらかじめ決めた 2 ファイルだけです。

| asset 名 | 実ファイル |
|---|---|
| `generator.js` | モジュール同梱の `flowgen.js` |
| `yaml-parser.js` | `js-yaml` のブラウザビルド |

**任意のパスを受け付ける実装ではありません。** `req.params.asset` は固定のマップを引く
キーとしてのみ使い、一致しなければ 404 を返します。したがって `../` を含むリクエスト
（例 `/flowgen/../package.json`）でも、マップに存在しないため 404 になります。
これはテストで固定しています。

### 一時的に書き込むパス

`GET /flowgen/source?url=<...git>` のみがディスクに書き込みます。CLI と同じく
`os.tmpdir()` 配下に `flowgen-git-XXXXXX` を作り、応答後に `fs.rm(..., { recursive: true })`
で削除します。clone は `--depth 1` で試み、サーバが shallow 非対応の場合のみ通常 clone に
フォールバックします。いずれも 60 秒でタイムアウトします。

`POST /flowgen/source`（zip アップロード）は **メモリ上で展開**し、ディスクには書きません。
リクエストボディが 50 MB を超えた時点で接続を破棄します。

Node-RED のフローファイル（`flows.json`）は本モジュールが直接書き換えることはありません。
生成したノードはブラウザからエディタに取り込まれ、ユーザーがデプロイして初めて保存されます。

## 公開エンドポイントと認証

すべて Node-RED の管理 API（`RED.httpAdmin`）配下に登録します。したがって公開先は
`httpAdminRoot`（既定は `/`）の下です。

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/flowgen/generator.js` | 生成ロジックをブラウザへ配信 |
| GET | `/flowgen/yaml-parser.js` | YAML パーサをブラウザへ配信 |
| GET | `/flowgen/source?url=…` | URL の取得、または git リポジトリの clone |
| POST | `/flowgen/source` | zip を展開して定義を取り出す |

### 認証による保護

3 つのルートすべてに、先頭ミドルウェアとして `RED.auth.needsPermission('flows.write')`
を適用しています。

```js
const needsPermission = RED.auth && RED.auth.needsPermission
    ? RED.auth.needsPermission('flows.write')
    : function (req, res, next) { next(); };

RED.httpAdmin.get('/flowgen/source', needsPermission, handler);
```

`settings.js` で `adminAuth` を設定していれば、**未認証のリクエストはハンドラに到達する前に
401 で拒否されます**。実際に `adminAuth` を有効化した Node-RED を起動して確認した結果が
以下です。

```
401 Unauthorized <- /flowgen/generator.js
401 Unauthorized <- /flowgen/yaml-parser.js
401 Unauthorized <- /flowgen/source?url=…
401 Unauthorized <- /settings          （Node-RED 本体）
401 Unauthorized <- /flows             （Node-RED 本体）
```

Node-RED 本体の管理 API と同じ扱いになっており、フローエディタにログインしていない
第三者が `/flowgen/source` を通じて git clone や外部アクセスを起こすことはできません。

権限に `flows.write` を選んだのは、この機能がフローを生成してエディタへ取り込むための
ものであり、読み取り専用ユーザー（`flows.read` のみ）に外部取得を許す理由がないためです。

### 過去に存在した脆弱性

**0.9.0 以前は、これらのエンドポイントに認証が適用されていませんでした。**
`adminAuth` を有効にしていても `/flowgen/source` は 200 を返し、未認証で
任意 URL の取得・任意リポジトリの clone・zip 展開を誘発できました（SSRF）。
0.10.0 で上記の権限チェックを追加して修正しています。0.9.0 以前を使用している場合は
更新してください。

### `adminAuth` を設定していない場合

Node-RED 本体の `/flows` や `/settings` と同様、誰でもアクセスできます。これは本モジュール
固有の問題ではなく Node-RED 全体の設定の問題です。**エディタを信頼できないネットワークに
公開する場合は `adminAuth` を必ず設定してください。**

## 残る注意点

- `GET /flowgen/source` は認証済みユーザーであれば任意の http(s) URL を取得できます。
  Node-RED サーバから到達できる内部ホストにも到達しうるため、権限を与える相手は
  フローを編集できる相手と同等に扱ってください。
- git clone は実行環境に `git` コマンドが必要です。無い場合はエラーメッセージを返します。
  zip アップロードは `git` を必要としません。
- CLI の `--output` は既存ファイルを確認なく上書きします。
