# Google Apps Script: メール送信 (添付対応版)

このコードを recruit@croslan.co.jp の Google Drive 内 Apps Script に置き換え、再デプロイすると、SMILE MATCHING からの一斉送信で **画像添付** が使えるようになります。

## デプロイ手順 (5 分)

1. https://script.google.com/ に **recruit@croslan.co.jp** でログイン
2. 既存のメール送信用プロジェクトを開く (前回設定したやつ)
3. `Code.gs` の中身を全部消して、下記コードを貼り付け
4. 上部メニュー: **デプロイ → デプロイを管理** → 既存デプロイの右の鉛筆アイコン
5. バージョン: **新バージョン** を選択 → 説明欄に「添付対応」 → **デプロイ**
6. URL は前回と **同じまま** なので Railway 側の `APPS_SCRIPT_EMAIL_URL` 更新は不要 ✅

## Code.gs (全部置き換え)

```javascript
/**
 * SMILE MATCHING からのメール送信 Web App
 *
 * 受信フォーマット (JSON POST):
 *   {
 *     secret: "...",                    // 環境変数 APPS_SCRIPT_EMAIL_SECRET と一致必須
 *     to: "a@x.com,b@y.com",           // カンマ区切り or 単一
 *     subject: "件名",
 *     text: "本文プレーン" (null可),
 *     html: "<div>本文HTML</div>" (null可),
 *     replyTo: "reply@x.com" (null可),
 *     fromName: "差出人表示名" (null可),
 *     attachments: [                    // 任意。画像 (JPG/PNG) を想定、最大 4 件
 *       { filename: "case.jpg", mimeType: "image/jpeg", dataBase64: "iVBORw0..." }
 *     ]
 *   }
 *
 * 応答:
 *   { ok: true } | { ok: false, error: "..." }
 *
 * セキュリティ:
 *   - secret が一致しないリクエストは弾く
 *   - From は MailApp の権限で recruit@croslan.co.jp として届く
 *   - HTTPS Web App = Anyone (匿名) 公開だが secret で実質保護
 */

// ⚠️ ここを Railway の APPS_SCRIPT_EMAIL_SECRET と完全一致させる
var SECRET = "ここに前回設定したシークレット文字列をそのまま入れる";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.secret !== SECRET) {
      return _json({ ok: false, error: "invalid secret" });
    }

    if (!body.to || !body.subject || (!body.text && !body.html)) {
      return _json({ ok: false, error: "to / subject / text or html が必要" });
    }

    var options = {};
    if (body.html) options.htmlBody = body.html;
    if (body.replyTo) options.replyTo = body.replyTo;
    if (body.fromName) options.name = body.fromName;

    // ── 添付処理 (任意) ──
    if (body.attachments && body.attachments.length > 0) {
      var blobs = [];
      for (var i = 0; i < body.attachments.length; i++) {
        var a = body.attachments[i];
        if (!a || !a.dataBase64 || !a.mimeType || !a.filename) continue;
        try {
          // base64 → バイト列 → Blob
          var bytes = Utilities.base64Decode(a.dataBase64);
          var blob = Utilities.newBlob(bytes, a.mimeType, a.filename);
          blobs.push(blob);
        } catch (attachErr) {
          // 1 つの添付エラーで全体が止まらないようスキップ
          Logger.log("attachment decode failed: " + a.filename + " / " + attachErr);
        }
      }
      if (blobs.length > 0) options.attachments = blobs;
    }

    // メール送信 (recruit@croslan.co.jp として送信)
    MailApp.sendEmail(body.to, body.subject, body.text || "", options);

    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## デプロイ後の確認

1. Railway 側で /broadcast 画面を開く
2. メッセージ本文を入力 → 「📷 画像添付」エリアで JPG / PNG を 1 枚追加
3. メール連絡先のあるテスト用パートナーを 1 社だけ選択
4. 「配信実行」 → メールボックスで画像が添付されているか確認

## 注意

- 添付サイズ合計が ~20MB を超えると Apps Script の URLFetch body 上限 (50MB) に近づきます。1 配信あたり画像 4 枚 × 5MB = 20MB が現実的な上限。
- LINE は弊社サーバーから画像 URL を直接読みに行くので、Apps Script は関係ありません。
- 既存の「画像なし」配信は変わらず動きます (attachments を渡さなければ従来通り)。
