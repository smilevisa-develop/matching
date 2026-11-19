# Notta の議事録を smile-matching で見られるようにする（Zapier 無料プラン）

企業との商談は代表しか出ていないため、Notta の議事録を人材チームが smile-matching で確認できるようにする。
Notta には公開 API がないので、次の流れにする。

```
Notta（AI 要約ができる）
  └─ Zapier（無料・2ステップ）がスプシ「Notta meeting notes」に1行書き足す
        └─ smile-matching の企業の画面 →「商談メモ」→「この会社の議事録を探す」
              タイトルに企業名を含む行だけを取り込んで保存する。無ければ「見つかりませんでした」
```

- Zapier の無料プランは **月100回** まで（1商談 = 1回）。Webhook は有料なので使わず、Google スプレッドシートに書く。
- スプシには **すべての商談** が書かれる。共有は代表とサービスアカウントだけにする。smile-matching に入るのは、ボタンを押した会社の分だけ。
- 会社名で探すので、**Notta の商談のタイトルに企業名を入れる**（例:「株式会社〇〇 面談」）。「株式会社」「(株)」、全角/半角、空白の違いは気にしなくてよい。

## いまの設定（2026-11 時点）

- スプシ: **Notta meeting notes**（持ち主 kodai.tsuchida@smilevisa.jp、ID `1UTA40JgF2qiJF8Nz9CAEdlF8NeMH6Rf0AdMhIJy5E2M`）
  - service@smilevisa.jp に **編集者** で共有（Zapier が書き足すため）
  - smile-matching のサービスアカウント（kodai-77@smile-link-493702.iam.gserviceaccount.com）に **閲覧者** で共有
- Coolify: `NOTTA_SHEET_URL` を production と preview に設定済み
- Zapier: **service@smilevisa.jp** のアカウント、Zap「Notta AI Notes to Google Sheets Row」（公開済み・ON）
  - Notta のつなぎ先も service@ のアカウント、ワークスペース「infoのワークスペース」

## 1. スプシを作る（1回だけ）

1. Google スプレッドシートを新しく作る（例:「Notta meeting notes」）。
2. **いちばん左のタブ** の1行目に、次の見出しを入れる（A〜F 列）。

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | ID | Title | Date | Summary | Transcript | URL |

   見出しの名前で読むので、列の順番は変わっても動く。日本語（録音ID / タイトル / 日時 / 要約 / 文字起こし / URL）でもよい。「Title」（タイトル）だけは必須。
3. 「共有」で、Zapier の Google Sheets をつないだアカウント（いまは service@smilevisa.jp）を **編集者** で追加する。
4. 「共有」で、smile-matching のサービスアカウント（Coolify の `GOOGLE_SERVICE_ACCOUNT_EMAIL` の値。いまは kodai-77@smile-link-493702.iam.gserviceaccount.com）を **閲覧者** で追加する。
5. スプシの URL を Coolify（matching → production → Environment Variables）の `NOTTA_SHEET_URL` に入れる。いちばん左以外のタブに書く場合は、そのタブ名を `NOTTA_SHEET_TAB` に入れる。

## 2. Zapier を設定する（service@smilevisa.jp でログイン）

1. **Create → Zap**。
2. Trigger: アプリ **Notta**、イベント **New AI Notes**（AI 要約ができたとき）。Notta のアカウントをつなぎ、Workspace を選び、Transcript と AI Summary を **True** にする。
3. Action: アプリ **Google Sheets**、イベント **Create Spreadsheet Row**。
   - Spreadsheet: 共有されたスプシは一覧に出ないことがある。そのときは右の「⋮」→ **Custom** にして、スプシの ID（URL の `/d/` と `/edit` の間）を貼る。
   - Worksheet: いちばん左のタブ（いまは「シート1」）
   - 列ごとに Notta の項目を割り当てる:
     - ID ← Record Link（録音ごとに1つなので、二重取り込みの目印に使う）
     - Title ← Title
     - Date ← Create Time（Unix 時刻の秒。smile-matching が日時に直す）
     - Summary ← Notes（AI 要約）
     - Transcript ← Content（文字起こし）
     - URL ← Record Link
4. **Test step** で1行入ることを確かめる（Notta の見本データ「title」が入るので、確かめたら消す）。**Publish** する。

## 3. 使い方

1. 企業の画面を開き、上のタブの **商談メモ** を押す。
2. **この会社の議事録を探す** を押す。
   - 見つかったら保存され、要約が新しい順に並ぶ。「文字起こしを見る」で全文、「Notta で開く」で Notta へ。
   - 無ければ「この会社の議事録は見つかりませんでした」と出る。
   - 何度押しても同じ議事録は二重に入らない。新しい商談のあとに押すと、その分だけ増える。
3. 名前が似ていて別の会社の議事録が入ったら **この会社のものではない** を押す。スプシは消えず、もう一度探してもその会社には戻らない。

## うまくいかないとき

| 画面の表示 | 直し方 |
|---|---|
| 議事録スプシの URL (NOTTA_SHEET_URL) が設定されていません | Coolify に `NOTTA_SHEET_URL` を入れて Redeploy |
| The caller does not have permission | スプシをサービスアカウントに共有していない |
| Unable to parse range | `NOTTA_SHEET_TAB` のタブ名がスプシと違う。合わせるか、消していちばん左のタブを読ませる |
| 議事録スプシの1行目に「タイトル」の見出しがありません | 1行目の見出しを直す（Title / タイトル） |
| 見つかりませんでした（あるはずなのに） | Notta のタイトルに企業名が入っているか、smile-matching の企業名と表記が同じか確かめる |

- スプシの1マスは約5万文字まで。長い商談の文字起こしは途中で切れることがある（要約と Notta のリンクは残る）。
