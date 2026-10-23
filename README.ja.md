# 🧩 dsh-ticker-jp（日株＆全世界株に対応）

[English](./README.md) · [简体中文](./README.zh-CN.md) · **日本語**

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/dsh-ticker-jp)](https://www.npmjs.com/package/dsh-ticker-jp)
[![dsh.so risk](https://www.dsh.so/badge/dsh-ticker-jp.svg)](https://www.dsh.so/artifact/dsh-ticker-jp/)
[![dsh.so install](https://www.dsh.so/badge/install/dsh-ticker-jp.svg)](https://www.dsh.so/artifact/dsh-ticker-jp/)

DeepSeek Harness の右上に置く、ドラッグできる小さな株価ウィジェットです。初期表示は日経225（`^N225`）と TOPIX 連動 ETF（`1306.T`）の 2 銘柄。4 桁の数字を入れると `.T` を補って日本株として扱います。Yahoo Finance が扱うコードなら何でも追加でき、米国株、香港株（`.HK`）、中国本土株（`.SS`/`.SZ`）も同じ画面で見られます。相場は Yahoo Finance から取り、ウィンドウの操作感は [dsh-stock-ticker](https://github.com/FeiZhuNiU-INFJA/dsh-stock-ticker) から引き継ぎました。違うのはデータの取り方だけです。

## 📸 プレビュー

<p align="center">
  <img src="./assets/screenshotEN.png" alt="チッカー表示" width="300">
  <img src="./assets/screenshot2EN.png" alt="折りたたみ表示" width="300">
  <img src="./assets/screenshot3EN.png" alt="ウォッチリスト設定" width="300">
</p>

## ✨ 機能

- ドラッグと折りたたみに対応しています。色は DSH のテーマに合わせます
- 1 銘柄 1 行で、銘柄名、価格、騰落率を表示します。既定は日本式で、上昇が赤、下落が緑です
- 日本株（`.T`）、米国株、香港株（`.HK`）、中国本土株（`.SS`/`.SZ`）など、Yahoo が扱う市場の銘柄を追加できます。4 桁の数字は日本株として `.T` を補い、`コード:表示名` と書けば別名も付けられます
- ウォッチ中の市場がすべて閉まっている間は、更新を 1 分に 1 回へ落とします。開いている間は 5 秒ごとです
- 上昇と下落の色は、日本式と米国式を切り替えられます
- UI は 16 言語です。初回はブラウザの言語に合わせ、あとから変更できます
- ウィンドウの位置、折りたたみ状態、ウォッチリスト、配色、言語はブラウザに保存されます
- 「初期化」を押すと、初期の 2 銘柄に戻ります

### デフォルトの銘柄

| 表示名    | コード   | 備考                                                      |
| --------- | -------- | --------------------------------------------------------- |
| TOPIX ETF | `1306.T` | Yahoo の TOPIX 指数 API は更新停止のため、連動 ETF で代替 |
| 日経225   | `^N225`  | 日経平均株価指数                                          |

## 📋 動作環境

| 項目    | 要件                                                          |
| ------- | ------------------------------------------------------------- |
| DSH     | `>=0.1.0-rc.7 <0.3.0`（`0.1.7-rc.2` と `0.2.1-rc.2` で確認）  |
| Node.js | `^22.19.0` または `>=24.0.0`                                  |

DSH は起動時に `engines.dsh` を読んで、読み込むかどうかを決めます。バージョンの範囲はそこに書いてあります。`@deepseek-ai/dsh-client-ui-slots` は peer 依存として宣言しているだけで、別途インストールする必要はありません。そのほかの DSH 側パッケージは使いません。

## 🚀 インストール

npm 版はビルド済みなので、ビルドの承認は要りません。GitHub のソースから直接入れることもできます。

```bash
# npm（推奨）
dsh plugin --profile web add dsh-ticker-jp

# GitHub ソース
dsh plugin --profile web add github:MurasakiIzumi/dsh-ticker-jp
```

入れたあと DSH を再起動するか、「今すぐ再起動」を選ぶと、ウィジェットがページ右上に表示されます。

## ⚙️ 使い方

1. タイトルバーの **⚙** をクリックすると設定が開きます。
2. 各行はコード、表示名、削除ボタンです。表示名は編集するとすぐ反映されます。空欄のときは、内蔵の略称、Yahoo の銘柄名、コードの順に使います。
3. 下の入力欄から銘柄を追加できます。`9984.T`、`AAPL`、`9984`（4 桁の数字は日本株として `.T` を補完）などを入れてください。`9984.T:ソフトバンク` のように書くと別名も付けられます。
4. 配色と言語はパネルの中央にあり、切り替えるとすぐ反映されます。
5. 「初期化」で TOPIX ETF と日経225 に戻り、「完了」でパネルが閉じます。

## 🗂️ コード構成

```
dsh-ticker-jp/
├── lib/index.js       # Host：/dsh-ticker-jp/quotes ルートを登録
├── lib/client.js      # Client：ウィジェット UI・ポーリング・ウォッチリスト/エイリアス
├── lib/index.d.ts     # Host の型定義
├── lib/client.d.ts    # Client の型定義
├── host.js            # 動的プラグインの Host 側（任意）
├── client.js          # 動的プラグインの Client 側（任意）
├── package.json       # パッケージマニフェスト
├── cordis.patch.yml   # bundle patch
├── CHANGELOG.md       # 変更履歴
├── assets/            # プレビュー画像
├── LICENSE
├── README.md          # English（メイン）
├── README.zh-CN.md    # 简体中文
└── README.ja.md       # 日本語
```

同じコードを 2 つの形で提供しています。`lib/` は DSH に常駐させる bundle 版、`host.js` / `client.js` は一時的に試すための動的プラグイン版です。動きは同じです。

## 🔌 データソース

- Yahoo Finance の chart API：`https://query1.finance.yahoo.com/v8/finance/chart/{コード}?interval=1d&range=1d`
- 無料で、認証は要りません。価格は `meta.regularMarketPrice`、騰落率は `meta.regularMarketChangePercent`、銘柄名は `longName`/`shortName` から取ります
- 日本株 `.T`、米国株、香港株 `.HK`、中国本土株 `.SS`/`.SZ` など、Yahoo が扱う市場に対応しています
- 各クオートには取引所のタイムゾーンと取引所名も入れて返すので、クライアント側で現地の取引時間を判定できます
- 銘柄名は自前で持たず、Yahoo の返り値をそのまま使います。初期の 2 銘柄だけは表示名を差し替えます

## 🧪 動的プラグイン（任意）

インストールせずに試したいときは、動的プラグインとして読み込めます。

1. `cordis_define` でプラグインを作り、`code.host` に [host.js](./host.js)、`code.client` に [client.js](./client.js) の全文を貼ります。
2. `cordis_run` で有効にします。クライアントは初回に承認カードが出るので、「許可」を押します。
3. ページを再読み込みすると、ウィジェットが表示されます。

動きは bundle と同じです。違うのは Host の取得経路だけです。動的形態は制限付きのサンドボックスで動くため `ctx.web` を使い、bundle はネイティブの `fetch` を使います。RPC の契約は同じです。

## 📄 ライセンス

[MIT](./LICENSE)

フローティングウィンドウの実装と構造は [FeiZhuNiU-INFJA](https://github.com/FeiZhuNiU-INFJA) 氏の [dsh-stock-ticker](https://github.com/FeiZhuNiU-INFJA/dsh-stock-ticker)（Copyright (c) 2026 Yulin）に由来します。本フォークはデータソースを差し替え、ウォッチリスト機能を追加し、対応する市場を世界中に広げました（Copyright (c) 2026 XuZhichao）。
