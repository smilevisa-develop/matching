/**
 * Slack のボタンが押されたとき。Slack アプリの Interactivity & Shortcuts の Request URL にする。
 *   https://matching.smilereach.jp/api/slack/interactions
 * 「入金を確認した」「振り込んだ」「取り消す」(lib/billing-slack)。3 秒以内に返すため、処理はあとで行う。
 */

import { after } from "next/server";
import { billingChannelRole, verifySlackRequest } from "@/lib/slack";
import { handleSlackButton } from "@/lib/billing-slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackRequest(raw, req.headers)) return new Response("bad signature", { status: 401 });
  const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}");
  if (payload.type !== "block_actions") return new Response("");
  const action = payload.actions?.[0];
  const channel = payload.channel?.id ?? payload.container?.channel_id;
  const ts = payload.message?.ts ?? payload.container?.message_ts;
  if (!action || !channel || !ts || !billingChannelRole(channel)) return new Response("");
  if (action.action_id !== "billing_done" && action.action_id !== "billing_undo") return new Response("");
  // 元の文 (ボタンの上の段) はそのまま残す
  const text: string = payload.message?.blocks?.find((b: { type: string }) => b.type === "section")?.text?.text ?? payload.message?.text ?? "";
  after(async () => {
    try {
      await handleSlackButton({ channel, ts, actionId: action.action_id, userId: payload.user?.id ?? "", userName: payload.user?.name ?? "", text });
    } catch (e) {
      console.warn("Slack のボタンの処理に失敗:", e);
    }
  });
  return new Response("");
}
