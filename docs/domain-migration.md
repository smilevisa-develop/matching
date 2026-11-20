# ドメインを smilematching.jp に揃える手順

求人管理システム（いま `matching.smilereach.jp`）を smilematching.jp のサブドメインに揃え、公開する案件ボードと同じ名前にする。
**外に出したリンクを1本も切らない**ことを最優先にする。

## いまの状態（2026-11-19 に確認）

| ドメイン | 状態 |
|---|---|
| `matching.smilereach.jp` | 本番。ログイン・公開ページ・LINE の受け口が動いている |
| `matching.up.railway.app`（その前の URL） | **すでに 404**。Railway からドメインが外されている |
| `smilematching.jp` | 企業向けのサイト（別のサーバー）。サブドメインを足してもこのサイトには影響しない |

前回の移行で旧 URL を外したため、**旧 URL で送ったリンクは今すべて開けない**（記入フォーム、求人票チェックリスト、事前確認資料、日本語チェック、パートナー記入フォーム、LINE で送った画像）。
今回は同じことを起こさない。

> 旧 URL のリンクを生き返らせたい場合：Railway の Settings → Networking で、`matching` の Railway ドメインをもう一度付けられるか試す（名前が空いていれば戻る）。

## 外に出しているリンク（ドメインに依存するもの）

| 種類 | パス | 誰に送っているか |
|---|---|---|
| **企業向けの推薦リスト** | `/list/{token}` | **企業**（共有中のリンク。企業が面接時間・備考を書き込む） |
| **SNS の相談リンク** | `/go/{国}-{媒体}`（例 `/go/id-tiktok`） | **SNS のプロフィールに掲載**（不特定多数） |
| パートナーアンケート | `/partner-survey/{token}` | パートナー（一斉連絡で送付） |
| 案件ボードの専用リンク | `/board/enter/{token}` | パートナー（今回追加） |
| 候補者の記入フォーム | `/intake/{token}` | 候補者 |
| 日本語チェック | `/japanese-check/{token}` | 候補者 |
| 母国語の求人票チェックリスト | `/checklist/{token}` | 候補者 |
| 内定後の事前確認資料 | `/document-check/{token}` | 候補者 |
| 新規パートナーの記入フォーム | `/partner-intake/{token}` | パートナー |
| AI 面接練習 | `/interview-practice` | 候補者 |
| LINE・Messenger・メールで送った画像 | `/api/files/{id}` | トークに残る |
| プライバシーポリシー | `/legal/privacy` | Meta のアプリ審査に登録 |
| LINE / Messenger / WhatsApp の受け口 | `/api/*/webhook` | 各サービスの管理画面に登録 |
| 定期実行 | `/api/cron/*` | GitHub Actions（secret `APP_URL`） |

推薦リストは、いまは企業に `/list/{token}` のリンクで共有している。**企業に渡したリンクがそのまま切れるので、最も注意が要る。**
（以前のスプレッドシート版の推薦リストの中のリンクは Google Drive なので、ドメインには関係しない。）

## 方針

1. **新しいドメインを「足す」。古いドメインは外さない。** `matching.smilereach.jp` は同じアプリにつないだまま、ずっと残す。
2. **古いドメインは転送ではなく、そのまま表示させる。** LINE などの受け口は転送に従わないことがあり、トークに残った画像も転送先で表示されない場合があるため。
3. `smilereach.jp` のドメイン契約は更新し続ける（切れると全部のリンクが切れる）。

## 手順

新しいドメインは `app.smilematching.jp`（社内システム）、公開ボードは `jobs.smilematching.jp` の案。

1. **Railway**：本番サービスの Settings → Networking → Custom Domain に `app.smilematching.jp` を**追加**（`matching.smilereach.jp` は消さない）。表示された CNAME の値を控える。
2. **DNS**（smilematching.jp は Xserver のネームサーバー）：`app` の CNAME を 1 の値で追加。
3. Railway で証明書が発行され、`https://app.smilematching.jp/login` が開くまで待つ。
4. **確認（必須）**：本番の `DATABASE_URL` を入れて次を実行し、`NG なし。` になるのを確かめる。
   上の表のリンクを DB から全部集めて、旧・新の両方で開けるか（転送するリンクは同じ先に転送されるか）を比べる。DB は読むだけ。
   「bot」を名乗って開くので、SNS の相談リンクのクリック数は増えない。

   ```bash
   npx tsx scripts/check-domain-links.ts https://matching.smilereach.jp https://app.smilematching.jp --all
   ```

5. Railway の環境変数 `PUBLIC_BASE_URL` を `https://app.smilematching.jp` に変える（これから送るリンクが新しいドメインになる）。GitHub の secret `APP_URL` も同じ値にする。
6. 社員に新しい URL を伝え、ブックマークを直してもらう（ログインはドメインごとなので一度ログインし直しになる）。画面からコピーするリンクは、開いているドメインで作られる。
7. LINE・Messenger・WhatsApp の受け口と Meta のプライバシーポリシー URL は、**急いで変えない**。変える場合も、古いドメインが生きているので戻せる。
8. 移行の 1 日後と 1 週間後にもう一度 4 を実行する。

## 参考：サーバーごと移すとき

`proxy.ts` には、サーバー移行用の `FORWARD_TO_URL`（旧サーバーから新サーバーへ、画面は 308 転送・/api は中継）と `MAINTENANCE_MODE` がある。
今回のようにサーバーは同じでドメインだけ足す場合は使わない。古いドメインも同じアプリにつないだまま、そのまま表示させる。

## やってはいけないこと

- `matching.smilereach.jp` を Railway から外す、DNS から消す
- 古いドメインを別のサービスやサイトに向ける
- 4 の確認をせずに 5 に進む
