/**
 * 案件ボード: パートナーが候補者を推薦する (ボードの cookie で本人確認)。
 *
 * POST { dealId, candidateName, ..., checks: { [必須条件]: true }, consent: true }
 *
 * 画面でも止めているが、ここでもう一度確かめる:
 *   - 公開中で、締切を過ぎていない
 *   - 必須条件にすべてチェックがある / 候補者本人の同意にチェックがある
 *   - 貴社の枠・全体の枠が残っている (見送り・取り下げは数えない)
 *   - 同じ案件に同じ名前の人がもう推薦されていない (先に届いた推薦を有効にする)
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";
import {
  BOARD_REC_INACTIVE,
  getBoardPartner,
  isPastDeadline,
  notifyStaff,
  requirementsOf,
  totalLimitOf,
} from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class BoardError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const normName = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export async function POST(req: Request) {
  try {
    const partner = await getBoardPartner();
    if (!partner) throw new BoardError("専用リンクから開き直してください / Please reopen the board from your link.", 401);

    const body = await req.json().catch(() => ({}));
    const dealId = Number(body?.dealId);
    const candidateName = text(body?.candidateName, 100);
    if (!Number.isInteger(dealId) || dealId <= 0) throw new BoardError("案件が見つかりません / Job not found.", 404);
    if (!candidateName) throw new BoardError("氏名を入れてください / Please enter the name.");
    if (body?.consent !== true) throw new BoardError("候補者本人の同意を確認してください / Please confirm the candidate's consent.");
    const resumeUrl = text(body?.resumeUrl, 1000);
    if (resumeUrl && !/^https?:\/\//i.test(resumeUrl)) throw new BoardError("履歴書のリンクは https:// で始めてください / Resume link must start with https://");
    const ageNum = Number(text(body?.age, 3));
    const checksIn = body?.checks && typeof body.checks === "object" ? (body.checks as Record<string, unknown>) : {};

    const created = await prisma.$transaction(
      async (tx) => {
        const deal = await tx.deal.findUnique({
          where: { id: dealId },
          select: {
            id: true,
            boardStatus: true,
            boardTitle: true,
            deadline: true,
            requiredCount: true,
            boardPerPartnerLimit: true,
            boardTotalLimit: true,
            boardRequirements: true,
          },
        });
        if (!deal || deal.boardStatus === "hidden") throw new BoardError("案件が見つかりません / Job not found.", 404);
        if (deal.boardStatus !== "open" || isPastDeadline(deal.deadline)) {
          throw new BoardError("この案件は締め切りました / This job is closed.", 409);
        }

        const requirements = requirementsOf(deal.boardRequirements);
        const missing = requirements.filter((r) => checksIn[r] !== true);
        if (missing.length) throw new BoardError(`必須条件を確認してください / Please confirm: ${missing.join(" / ")}`);

        const existing = await tx.boardRecommendation.findMany({
          where: { dealId, status: { notIn: BOARD_REC_INACTIVE } },
          select: { partnerId: true, candidateName: true },
        });
        if (existing.some((r) => normName(r.candidateName) === normName(candidateName))) {
          throw new BoardError("この方は、この案件にすでに推薦されています / This candidate has already been recommended for this job.", 409);
        }
        if (existing.filter((r) => r.partnerId === partner.id).length >= deal.boardPerPartnerLimit) {
          throw new BoardError(`貴社の推薦枠 (${deal.boardPerPartnerLimit} 名) を使い切りました / You have used all your slots.`, 409);
        }
        if (existing.length >= totalLimitOf(deal)) {
          throw new BoardError("推薦枠が埋まりました / All recommendation slots are filled.", 409);
        }

        const checks: Record<string, boolean> = {};
        for (const r of requirements) checks[r] = true;

        return tx.boardRecommendation.create({
          data: {
            dealId,
            partnerId: partner.id,
            candidateName,
            nationality: text(body?.nationality, 50) || null,
            age: Number.isInteger(ageNum) && ageNum > 0 && ageNum < 100 ? ageNum : null,
            gender: text(body?.gender, 10) || null,
            residence: text(body?.residence, 10) || null,
            residenceStatus: text(body?.residenceStatus, 50) || null,
            japaneseLevel: text(body?.japaneseLevel, 50) || null,
            experience: text(body?.experience, 300) || null,
            resumeUrl: resumeUrl || null,
            note: text(body?.note, 2000) || null,
            checks,
          },
          select: { id: true, deal: { select: { boardTitle: true } } },
        });
      },
      { isolationLevel: "Serializable" },
    );

    after(() =>
      notifyStaff(
        `📨 案件ボードに推薦 #${created.id}\n${partner.name} → ${created.deal.boardTitle ?? `案件 ${dealId}`}\n候補者: ${candidateName}\n${publicUrl("/board-manage?tab=recs")}`,
      ),
    );

    return Response.json({ ok: true, id: created.id });
  } catch (error) {
    const status = error instanceof BoardError ? error.status : 500;
    const message =
      error instanceof BoardError
        ? error.message
        : "送信できませんでした。少し待ってからもう一度お試しください / Could not send. Please try again.";
    if (!(error instanceof BoardError)) console.error("[board] recommend failed", error);
    return Response.json({ ok: false, error: message }, { status });
  }
}
