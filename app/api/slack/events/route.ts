/**
 * Slack からのイベント (請求スレッド)。Slack アプリの Event Subscriptions の Request URL にする。
 *   https://matching.smilereach.jp/api/slack/events
 * 使うイベント: message.channels / message.groups (PDF が貼られた), reaction_added / reaction_removed (✅)
 * Slack は 3 秒で返事が無いと送り直すので、すぐ 200 を返して、処理はあとで行う。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { slackConfig, verifySlackRequest } from "@/lib/slack";
import { handleSlackFiles, handleSlackReaction } from "@/lib/billing-slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackRequest(raw, req.headers)) return new Response("bad signature", { status: 401 });
  const body = JSON.parse(raw);
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
  if (body.type !== "event_callback" || !body.event) return new Response("ok");

  const ev = body.event;
  const { channel } = slackConfig();
  // 決めたチャンネルだけ。ボット自身の投稿は見ない
  const evChannel = ev.channel ?? ev.item?.channel;
  if (!channel || evChannel !== channel || ev.bot_id) return new Response("ok");
  // 同じイベントを 2 回処理しない
  try {
    await prisma.slackEventSeen.create({ data: { id: String(body.event_id) } });
  } catch {
    return new Response("ok");
  }

  after(async () => {
    try {
      if (ev.type === "message" && Array.isArray(ev.files) && ev.files.length) await handleSlackFiles(ev);
      else if (ev.type === "reaction_added") await handleSlackReaction(ev, true);
      else if (ev.type === "reaction_removed") await handleSlackReaction(ev, false);
    } catch (e) {
      console.warn("Slack のイベントの処理に失敗:", e);
    }
  });
  return new Response("ok");
}
