/**
 * Slack のボタンが押されたとき。Slack アプリの Interactivity & Shortcuts の Request URL にする。
 *   https://matching.smilereach.jp/api/slack/interactions
 * 「入金を確認した」「振り込んだ」「取り消す」(lib/billing-slack)。3 秒以内に返すため、処理はあとで行う。
 */

import { after } from "next/server";
import { billingChannelRole, textOfBlocks, verifySlackRequest } from "@/lib/slack";
import { handlePartnerInvoicePick, handleSlackButton } from "@/lib/billing-slack";

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
  // PA の請求書のメニュー: 選ぶだけのときは何もしない。「保存する」で保存
  if (action.action_id === "pa_save") {
    const picked: { value: string }[] = payload.state?.values?.pa?.pa_pick?.selected_options ?? [];
    after(async () => {
      try {
        const postId = Number(action.value) || undefined;
        await handlePartnerInvoicePick({ channel, ts, postId, responseUrl: payload.response_url, personIds: picked.map((o) => Number(o.value)), userName: payload.user?.name ?? "" });
      } catch (e) {
        console.warn("PA の請求書の保存に失敗:", e);
        const { slackPost } = await import("@/lib/slack");
        await slackPost(channel, `⚠️ 保存できませんでした: ${e instanceof Error ? e.message : String(e)}`, payload.message?.thread_ts ?? ts).catch(() => {});
      }
    });
    return new Response("");
  }
  if (action.action_id !== "billing_done" && action.action_id !== "billing_undo") return new Response("");
  // 元の文 (ボタンの上の段) はそのまま残す
  const text: string = textOfBlocks(payload.message?.blocks) || payload.message?.text || "";
  after(async () => {
    try {
      await handleSlackButton({ channel, ts, actionId: action.action_id, userId: payload.user?.id ?? "", userName: payload.user?.name ?? "", text });
    } catch (e) {
      console.warn("Slack のボタンの処理に失敗:", e);
    }
  });
  return new Response("");
}
