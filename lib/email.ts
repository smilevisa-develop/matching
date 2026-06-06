/**
 * メール送信ライブラリ (Gmail API 経由 / HTTPS)
 *
 * Railway は外向き SMTP (port 587/465) を遮断するため、HTTPS 経由で
 * Gmail API users.messages.send を叩く。
 *
 * 仕組み:
 *   - 既存の Google Service Account (Drive/Docs 用) を流用
 *   - Domain-wide Delegation (DwD) で recruit@croslan.co.jp を impersonate
 *   - JWT 認証で Gmail API を呼ぶ
 *
 * Workspace 管理者作業 (1 回だけ):
 *   admin.google.com → セキュリティ → アクセスとデータ制御 → API の制御
 *     → ドメイン全体の委任を管理 → 新しく追加
 *   Client ID: サービスアカウントの 21 桁 数値 ID (Cloud Console で確認)
 *   OAuth スコープ: https://www.googleapis.com/auth/gmail.send
 *
 * 環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL = (既存)
 *   GOOGLE_PRIVATE_KEY           = (既存)
 *   GMAIL_SEND_AS_USER           = recruit@croslan.co.jp (impersonate するアカウント)
 *   GMAIL_FROM                   = 株式会社CROSLAN-人材紹介事業部 <recruit@croslan.co.jp>
 *   GMAIL_REPLY_TO               = (任意)
 */
import { google } from "googleapis";

export type EmailSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function getGooglePrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("GOOGLE_PRIVATE_KEY が未設定です");
  // env では \n がエスケープされて入っているケースが多いので復元
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function getGoogleClientEmail(): string {
  const value = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!value) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL が未設定です");
  return value;
}

/** RFC 2822 形式のメール本体を Base64URL エンコード */
function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): string {
  const headers: string[] = [];
  headers.push(`From: ${opts.from}`);
  headers.push(`To: ${opts.to}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  // Subject は MIME B エンコード (=?UTF-8?B?...?=) で日本語対応
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`;
  headers.push(`Subject: ${subjectEncoded}`);
  headers.push("MIME-Version: 1.0");

  let body: string;
  if (opts.html && opts.text) {
    const boundary = `b_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body =
      "\r\n" +
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      Buffer.from(opts.text, "utf-8").toString("base64") +
      `\r\n--${boundary}\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      Buffer.from(opts.html, "utf-8").toString("base64") +
      `\r\n--${boundary}--`;
  } else if (opts.html) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    body = "\r\n" + Buffer.from(opts.html, "utf-8").toString("base64");
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    body = "\r\n" + Buffer.from(opts.text ?? "", "utf-8").toString("base64");
  }

  const message = headers.join("\r\n") + "\r\n" + body;
  // Gmail API は base64url 形式 (-, _、パディング無し)
  return Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * 1 件のメールを送信する。Gmail API users.messages.send 経由。
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): Promise<EmailSendResult> {
  const sendAsUser = process.env.GMAIL_SEND_AS_USER?.trim();
  const from = process.env.GMAIL_FROM?.trim() ?? sendAsUser;

  if (!sendAsUser) {
    return {
      ok: false,
      error:
        "GMAIL_SEND_AS_USER が未設定です。Domain-wide Delegation で impersonate するアカウントを指定してください。",
    };
  }
  if (!from) {
    return { ok: false, error: "GMAIL_FROM または GMAIL_SEND_AS_USER が必要です" };
  }
  if (!opts.text && !opts.html) {
    return { ok: false, error: "text または html のいずれかが必要です" };
  }

  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const replyTo = opts.replyTo ?? process.env.GMAIL_REPLY_TO ?? undefined;

  try {
    const auth = new google.auth.JWT({
      email: getGoogleClientEmail(),
      key: getGooglePrivateKey(),
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: sendAsUser, // ← DwD で impersonate するユーザー
    });
    await auth.authorize();
    const gmail = google.gmail({ version: "v1", auth });

    const raw = buildRawEmail({
      from,
      to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo,
    });

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { ok: true, id: res.data.id ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "gmail api error" };
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
export const DEFAULT_EMAIL_SUBJECT = "【SMILE MATCHING】ご連絡";
