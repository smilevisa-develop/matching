/**
 * メール送信ライブラリ (SMTP 経由)
 *
 * デフォルトで Gmail / Google Workspace の SMTP を使用する想定。
 * 返信は SMTP_USER (送信元) の受信箱に直接届く。
 *
 * 環境変数:
 *   SMTP_HOST     = smtp.gmail.com
 *   SMTP_PORT     = 587  (TLS / STARTTLS)
 *   SMTP_USER     = 認証アカウント (例: kodai.tsuchida@smilevisa.jp)
 *   SMTP_PASS     = (Google アプリパスワード 16 文字)
 *   SMTP_FROM     = 表示用差出人 (例: SMILE MATCHING <info@smilevisa.jp>)
 *                   ※ SMTP_USER と同じか、その Send-as に追加済みのアドレスでないと
 *                   Gmail が From を書き換えるので注意
 *   SMTP_REPLY_TO = 返信先 (例: info@smilevisa.jp)
 *                   省略時は SMTP_FROM の宛先に返信が届く
 */
import nodemailer, { type Transporter } from "nodemailer";

export type EmailSendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS、587 = STARTTLS
    auth: { user, pass },
  });
  return cachedTransporter;
}

/**
 * 1 件のメールを送信する。HTML / プレーンテキスト両対応。
 * - text のみ渡すとプレーンテキストメール
 * - html のみ渡すと HTML メール
 * - 両方渡すと マルチパート (text は HTML 非対応クライアント用フォールバック)
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  /** Reply-To ヘッダ。省略時は SMTP_USER と同じになるので、別アドレスへの返信誘導に使う */
  replyTo?: string;
}): Promise<EmailSendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      ok: false,
      error: "SMTP_HOST / SMTP_USER / SMTP_PASS のいずれかが未設定です",
    };
  }
  if (!opts.text && !opts.html) {
    return { ok: false, error: "text または html のいずれかが必要です" };
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  if (!from) {
    return { ok: false, error: "SMTP_FROM または SMTP_USER が必要です" };
  }

  const replyTo = opts.replyTo ?? process.env.SMTP_REPLY_TO ?? undefined;

  try {
    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "smtp error" };
  }
}

/**
 * テンプレ本文 (プレーンテキスト) を簡易 HTML に変換。
 * 改行を <br> に、URL を <a> に置換するだけの軽量変換。
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
