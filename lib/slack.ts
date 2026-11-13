/**
 * Slack (請求スレッド用のボット)。
 *
 * 環境変数 (Coolify に入れる。未設定なら何もしない):
 *   SLACK_BOT_TOKEN        … ボットのトークン (xoxb-)
 *   SLACK_SIGNING_SECRET   … Slack から届いたイベントの確認用
 *   SLACK_BILLING_CHANNEL  … お客様 (企業への請求) のチャンネルの ID (C… / G…)。本番は「請求管理_to_お客様」。最初は土田さんだけのテスト用チャンネル
 *   SLACK_PARTNER_CHANNEL  … パートナー (PA への支払い) のチャンネルの ID。本番は「請求管理_to_パートナー」。無ければお客様と同じチャンネル
 *   SLACK_BILLING_MENTION  … 依頼の先頭に付けるメンション (例 "<@U123> cc <@U456>")。無ければ文字のまま
 */

import crypto from "node:crypto";

export const slackConfig = () => ({
  token: process.env.SLACK_BOT_TOKEN?.trim() || "",
  secret: process.env.SLACK_SIGNING_SECRET?.trim() || "",
  channel: process.env.SLACK_BILLING_CHANNEL?.trim() || "",
  partnerChannel: process.env.SLACK_PARTNER_CHANNEL?.trim() || process.env.SLACK_BILLING_CHANNEL?.trim() || "",
  mention: process.env.SLACK_BILLING_MENTION?.trim() || "",
});

/** 請求で見るチャンネルか。お客様用 / パートナー用 / 両方 (同じチャンネルのとき) */
export function billingChannelRole(channel: string | undefined): "customer" | "partner" | "both" | null {
  const { channel: c, partnerChannel: p } = slackConfig();
  if (!channel || !c) return null;
  if (channel === c && channel === p) return "both";
  if (channel === c) return "customer";
  if (channel === p) return "partner";
  return null;
}

/** Slack から届いたリクエストか確かめる (署名と 5 分以内の時刻) */
export function verifySlackRequest(rawBody: string, headers: Headers): boolean {
  const { secret } = slackConfig();
  if (!secret) return false;
  const ts = headers.get("x-slack-request-timestamp") ?? "";
  const sig = headers.get("x-slack-signature") ?? "";
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(mine);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Slack の Web API を呼ぶ */
export async function slackApi<T = Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const { token } = slackConfig();
  if (!token) throw new Error("SLACK_BOT_TOKEN が未設定です");
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  if (!json.ok) console.warn(`Slack ${method} に失敗:`, json.error, JSON.stringify((json as { response_metadata?: unknown }).response_metadata ?? ""));
  return json;
}

export async function slackPost(channel: string, text: string, threadTs?: string, blocks?: unknown[]) {
  return slackApi<{ ts?: string }>("chat.postMessage", { channel, text, thread_ts: threadTs, blocks, unfurl_links: false, unfurl_media: false });
}

export async function slackUpdate(channel: string, ts: string, text: string, blocks: unknown[]) {
  return slackApi("chat.update", { channel, ts, text, blocks });
}

/** 文 + ボタン 1 つのメッセージ (Block Kit) */
export function textWithButton(text: string, button: { label: string; actionId: string; style?: "primary" | "danger" }, note?: string) {
  return [
    { type: "section", text: { type: "mrkdwn", text } },
    ...(note ? [{ type: "context", elements: [{ type: "mrkdwn", text: note }] }] : []),
    {
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: button.label }, action_id: button.actionId, ...(button.style ? { style: button.style } : {}) }],
    },
  ];
}

/** Slack に上がったファイルを取ってくる (ボットのトークンが要る) */
export async function downloadSlackFile(url: string): Promise<Buffer> {
  const { token } = slackConfig();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Slack のファイルを取れませんでした (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 権限が足りないと HTML のログイン画面が返る
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF として読めませんでした (ボットに files:read の権限があるか確認)");
  return buf;
}
