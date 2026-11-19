/**
 * 案件ボード: パートナーが案件について質問する (ボードの cookie で本人確認)。
 * POST { dealId, question }
 * 社員が回答すると案件ページに出る (公開にすると全パートナーが見られる)。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";
import { getBoardPartner, notifyStaff } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1 社が 1 案件に出せる未回答の質問の数 (連投で窓口が埋まらないように) */
const MAX_OPEN_QUESTIONS = 5;

export async function POST(req: Request) {
  const partner = await getBoardPartner();
  if (!partner) {
    return Response.json({ ok: false, error: "専用リンクから開き直してください / Please reopen the board from your link." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const dealId = Number(body?.dealId);
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!Number.isInteger(dealId) || !question) {
    return Response.json({ ok: false, error: "質問を入れてください / Please enter a question." }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { boardStatus: true, boardTitle: true } });
  if (!deal || deal.boardStatus === "hidden") {
    return Response.json({ ok: false, error: "案件が見つかりません / Job not found." }, { status: 404 });
  }

  const open = await prisma.boardQuestion.count({ where: { dealId, partnerId: partner.id, answer: null } });
  if (open >= MAX_OPEN_QUESTIONS) {
    return Response.json(
      { ok: false, error: "未回答の質問が多いため、回答をお待ちください / Please wait for answers to your earlier questions." },
      { status: 429 },
    );
  }

  const q = await prisma.boardQuestion.create({ data: { dealId, partnerId: partner.id, question }, select: { id: true } });

  after(() =>
    notifyStaff(
      `❓ 案件ボードに質問 #${q.id}\n${partner.name} → ${deal.boardTitle ?? `案件 ${dealId}`}\n${question}\n${publicUrl("/board-manage?tab=qa")}`,
    ),
  );

  return Response.json({ ok: true, id: q.id });
}
