import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { isOfferedStage } from "@/lib/onboarding-autolink";
import { after } from "next/server";
import { stageCounterDeltas, todayJst, type CounterField } from "@/lib/deal-stages";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { changeCandidateStage, cleanUpMistakenOffer } from "@/lib/deal-candidate-stage";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const stage = String(body.stage ?? "").trim();
    const note = body.note === undefined ? undefined : String(body.note ?? "").trim() || null;
    // ステージに入れた日付 (カンバンで入力)。無ければ今日 (日本時間)
    const dateInput = body.date === undefined || body.date === null ? "" : String(body.date).trim();
    if (dateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return Response.json({ ok: false, error: "日付は YYYY-MM-DD で指定してください" }, { status: 400 });
    }
    const date = dateInput || todayJst();

    if (!stage) {
      return Response.json({ ok: false, error: "候補者ステップを指定してください" }, { status: 400 });
    }

    const { candidate, counters } = await changeCandidateStage(Number(id), stage, date, note);

    return Response.json({ ok: true, candidate, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

/**
 * カンバンから候補者を外す (間違えて入れたとき)。候補者本体は残る。
 * このカードで数えた人数カウンター (推薦・面接・内定など) も、接続済みまで戻したのと同じだけ戻す。
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const removedLink = await prisma.dealCandidate.findUniqueOrThrow({
      where: { id: Number(id) },
      select: { stage: true, personId: true },
    });
    const counters = await prisma.$transaction(async (tx) => {
      const link = await tx.dealCandidate.findUniqueOrThrow({
        where: { id: Number(id) },
        select: { stage: true, dealId: true },
      });
      const select = {
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        declineCount: true,
        rejectCount: true,
      };
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: link.dealId }, select });
      const deltas = Object.entries(stageCounterDeltas(link.stage, "接続済み")).filter(([, n]) => n !== 0) as [
        CounterField,
        number,
      ][];
      await tx.dealCandidate.delete({ where: { id: Number(id) } });
      if (deltas.length === 0) return deal;
      return tx.deal.update({
        where: { id: link.dealId },
        data: Object.fromEntries(deltas.map(([f, n]) => [f, Math.max(0, deal[f] + n)])),
        select,
      });
    });
    after(() => requestCompanyDatabaseSync());
    // 内定承諾などで自動で作ったカード・企業データベースの行も片付ける (間違えて入れた人のため)
    if (isOfferedStage(removedLink.stage)) after(() => cleanUpMistakenOffer(removedLink.personId));
    return Response.json({ ok: true, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

