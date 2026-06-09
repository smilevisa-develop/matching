/**
 * メール送信ライブラリ (Google Apps Script Web App 経由)
 *
 * Railway は外向き SMTP を遮断するため、Gmail API は CEO の DwD 承認が必要、
 * という制約を回避するアプローチ:
 *   - recruit@croslan.co.jp の Google Drive 内に Apps Script を作る
 *   - Apps Script を Web App として公開 (Execute as: Me, Access: Anyone)
 *   - Railway は その URL に HTTPS POST するだけで送信完了
 *
 * Apps Script は recruit@ 自身の権限で MailApp.sendEmail() を呼ぶので、
 * From: は recruit@croslan.co.jp として届く。
 * Workspace ユーザー上限 1500 通/日 (御社用途 500 社 × 月 4 配信 = 月 2000 ≈ 67/日 で十分)
 *
 * 環境変数:
 *   APPS_SCRIPT_EMAIL_URL    = https://script.google.com/macros/s/AKfycb.../exec
 *   APPS_SCRIPT_EMAIL_SECRET = (Apps Script 内のコードと同じ秘密文字列。不正利用防止)
 *   GMAIL_FROM               = 株式会社CROSLAN-人材紹介事業部 (任意、表示名のみ)
 *   GMAIL_REPLY_TO           = (任意) 別の返信先に集約したい場合
 */

export type EmailSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/**
 * 添付ファイル。Apps Script 側で base64 デコード → Utilities.newBlob → 添付。
 *   - filename:   "case-flyer.jpg" など
 *   - mimeType:   "image/jpeg" / "image/png"
 *   - dataBase64: 添付バイト列の base64 文字列 (header なし)
 */
export type EmailAttachment = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

/**
 * 1 件のメールを Apps Script Web App 経由で送信。
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  /**
   * 添付ファイル (任意)。画像 (JPG / PNG) を想定、最大 5 件 / 合計 25MB 程度まで。
   * Apps Script の URLFetch には body サイズ上限 50MB あり、base64 で 4/3 倍なので
   * 実質 35MB 弱までは送れる。安全側に 25MB を上限の目安。
   */
  attachments?: EmailAttachment[];
}): Promise<EmailSendResult> {
  const url = process.env.APPS_SCRIPT_EMAIL_URL?.trim();
  const secret = process.env.APPS_SCRIPT_EMAIL_SECRET?.trim();
  const fromName = process.env.GMAIL_FROM?.trim() ?? undefined;
  const defaultReplyTo = process.env.GMAIL_REPLY_TO?.trim() ?? undefined;

  if (!url || !secret) {
    return {
      ok: false,
      error:
        "APPS_SCRIPT_EMAIL_URL / APPS_SCRIPT_EMAIL_SECRET が未設定です。Apps Script のセットアップ後 Railway に追加してください。",
    };
  }
  if (!opts.text && !opts.html) {
    return { ok: false, error: "text または html のいずれかが必要です" };
  }

  const to = Array.isArray(opts.to) ? opts.to.join(",") : opts.to;
  const replyTo = opts.replyTo ?? defaultReplyTo;

  try {
    // Apps Script は POST body で受信、JSON で応答
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 90 秒タイムアウト
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        secret,
        to,
        subject: opts.subject,
        text: opts.text ?? null,
        html: opts.html ?? null,
        replyTo: replyTo ?? null,
        fromName: fromName ?? null,
        // 添付 (任意)。Apps Script 側が attachments: [{filename, mimeType, dataBase64}] を期待
        attachments: opts.attachments && opts.attachments.length > 0 ? opts.attachments : null,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { ok?: boolean; error?: string; id?: string };
    if (data.ok) {
      return { ok: true, id: data.id };
    }
    return { ok: false, error: data.error ?? "Apps Script returned no detail" };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return { ok: false, error: "Apps Script 応答が 90 秒以内に返らなかった" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "fetch error" };
  }
}

/**
 * テンプレ本文 (プレーンテキスト) を簡易 HTML に変換。
 */
export function textToBasicHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#0c8a61;text-decoration:underline">$1</a>'
  );
  const withBreaks = linked.replace(/\n/g, "<br>");
  return `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937">${withBreaks}</div>`;
}

/** デフォルトの件名 (テンプレに emailSubject が無いときに使う) */
export const DEFAULT_EMAIL_SUBJECT = "【株式会社CROSLAN-人材事業部】ご連絡";
