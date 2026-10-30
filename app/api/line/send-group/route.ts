/**
 * パートナーではない LINE グループ (内定後のグループなど。LineGroup.chatOnly) へ 1 件送る (チャット画面から)。
 * パートナー宛ては send-partner。こちらは {{変数}} の展開も @All のメンションもしない
 * (内定者のグループで毎回全員に通知が飛ばないように)。
 * 本文: { groupId: string, message: string }
 */
import { after } from "next/server";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { translateForAllStaff } from "@/lib/chat-translate";
import { buildLineTextMessage } from "@/lib/line-message";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const { groupId, message } = await req.json();
    if (typeof groupId !== "string" || !groupId || typeof message !== "string" || !message.trim()) {
      return Response.json({ ok: false, error: "groupId と message は必須です" }, { status: 400 });
    }
    const group = await prisma.lineGroup.findUnique({ where: { groupId } });
    if (!group || !group.isActive) {
      return Response.json({ ok: false, error: "Bot が在籍している LINE グループではありません" }, { status: 404 });
    }
    if (group.partnerId) {
      return Response.json({ ok: false, error: "パートナーに紐づいたグループです。パートナーのトークから送ってください" }, { status: 400 });
    }
    if (!group.chatOnly) {
      return Response.json({ ok: false, error: "チャットに追加していないグループです (連絡先紐づけで「パートナーではない」にしてください)" }, { status: 400 });
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return Response.json({ ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" }, { status: 500 });
    }
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: groupId, messages: [buildLineTextMessage(groupId, message, { mentionAll: false })] }),
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: "LINE 送信に失敗しました", body: await res.text() }, { status: 500 });
    }

    const saved = await prisma.message.create({
      data: { channel: "LINE-Group", direction: "outbound", content: message, externalId: groupId },
    });
    // 他の担当者が自分の言語で読めるように訳しておく
    after(() => translateForAllStaff(saved.id));
    return Response.json({ ok: true, channel: "LINE-Group", content: message, id: saved.id });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
