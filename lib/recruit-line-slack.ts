/**
 * recruit 公式 LINE (株式会社CROSLAN-人材事業部 @494mlwqg) に届いたものを Slack に転送する (2026/11)。
 *
 * - 1 対 1 のトークだけ。グループ・複数人トークは転送しない
 * - 新しい友だち追加 (follow) のときは担当者にメンションして知らせる
 * - LINE の再送 (isRedelivery) は二重に出ないよう転送しない
 *
 * 環境変数 (Coolify に入れる。チャンネルが未設定なら何もしない):
 *   RECRUIT_LINE_SLACK_CHANNEL … 転送先チャンネルの ID。CROSLAN-人材紹介 の #recruit-line は C0CHFL2LUV7。ボット (SLACK_BOT_TOKEN) をチャンネルに招待しておく
 *   RECRUIT_LINE_SLACK_MENTION … 友だち追加のときのメンション。トゥイ・チンディ・MOON は "<@U09RDDMV0TS> <@U0AKQD0A4MB> <@U0BS751AVBN>"
 */
import { slackPost } from "@/lib/slack";

type LineEvent = {
  type?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string; fileName?: string; title?: string; address?: string };
  deliveryContext?: { isRedelivery?: boolean };
};

const config = () => ({
  channel: process.env.RECRUIT_LINE_SLACK_CHANNEL?.trim() || "",
  mention: process.env.RECRUIT_LINE_SLACK_MENTION?.trim() || "",
});

/** LINE の表示名 (取れなければ null) */
async function displayName(userId: string, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return ((await res.json()) as { displayName?: string }).displayName ?? null;
  } catch {
    return null;
  }
}

/** Slack の mrkdwn で特別な意味を持つ文字を無害にする */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** テキスト以外のメッセージの見出し */
function describeMessage(m: NonNullable<LineEvent["message"]>): string {
  switch (m.type) {
    case "text":
      return esc(m.text ?? "");
    case "image":
      return "📷 (画像が送られました。LINE で確認してください)";
    case "video":
      return "🎬 (動画が送られました。LINE で確認してください)";
    case "audio":
      return "🎤 (音声が送られました。LINE で確認してください)";
    case "file":
      return `📎 (ファイル${m.fileName ? `「${esc(m.fileName)}」` : ""}が送られました。LINE で確認してください)`;
    case "sticker":
      return "(スタンプ)";
    case "location":
      return `📍 (位置情報${m.title || m.address ? `: ${esc(m.title ?? m.address ?? "")}` : ""})`;
    default:
      return `(${m.type ?? "不明"} が送られました)`;
  }
}

/** Slack に出す文。転送しないイベントは null */
export function recruitSlackText(ev: LineEvent, name: string | null, mention: string): string | null {
  if (ev.source?.type !== "user" || !ev.source.userId) return null; // 1 対 1 のみ
  if (ev.deliveryContext?.isRedelivery) return null;
  const who = name ? `*${esc(name)}* さん` : "(名前を取れませんでした)";
  if (ev.type === "follow") {
    return `${mention ? `${mention}\n` : ""}🎉 recruit公式LINEに新しい友だちが追加されました: ${who}`;
  }
  if (ev.type === "message" && ev.message) {
    const body = describeMessage(ev.message)
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    return `💬 ${who} からメッセージ\n${body}`;
  }
  return null;
}

/** webhook で受けたイベントを Slack に転送する。失敗しても webhook 本体は止めない */
export async function forwardRecruitLineToSlack(events: LineEvent[], lineToken: string | undefined) {
  const { channel, mention } = config();
  if (!channel) return;
  for (const ev of events) {
    try {
      if (!recruitSlackText(ev, null, mention)) continue; // 対象外なら名前も取りに行かない
      const name = await displayName(ev.source!.userId!, lineToken);
      const text = recruitSlackText(ev, name, mention);
      if (text) await slackPost(channel, text);
    } catch (e) {
      console.warn("[line/webhook] Slack への転送に失敗:", e instanceof Error ? e.name : "unknown");
    }
  }
}
