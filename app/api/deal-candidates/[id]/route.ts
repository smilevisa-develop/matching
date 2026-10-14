import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { onDealCandidateStageChanged } from "@/lib/onboarding-autolink";
import { after } from "next/server";
import { stageCounterDeltas, type CounterField } from "@/lib/deal-stages";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const stage = String(body.stage ?? "").trim();
    const note = body.note === undefined ? undefined : String(body.note ?? "").trim() || null;

    if (!stage) {
      return Response.json({ ok: false, error: "候補者ステップを指定してください" }, { status: 400 });
    }

    // ステージの移動に合わせて人数カウンターも動かす (カンバンと数字を常に揃えるため)。
    // 同時に動かされても二重に数えないよう、前のステージの読み取りから更新までを 1 つにまとめる。
    const { candidate, counters } = await prisma.$transaction(async (tx) => {
      const before = await tx.dealCandidate.findUniqueOrThrow({
        where: { id: Number(id) },
        select: { stage: true, dealId: true },
      });
      const candidate = await tx.dealCandidate.update({
        where: { id: Number(id) },
        data: {
          stage,
          ...(note !== undefined ? { note } : {}),
        },
      });
      const deltas = Object.entries(stageCounterDeltas(before.stage, stage)).filter(([, n]) => n !== 0) as [
        CounterField,
        number,
      ][];
      const select = {
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        declineCount: true,
        rejectCount: true,
      };
      const current = await tx.deal.findUniqueOrThrow({ where: { id: before.dealId }, select });
      if (deltas.length === 0) return { candidate, counters: current };
      const counters = await tx.deal.update({
        where: { id: before.dealId },
        // 手で直した結果より多く戻されても 0 未満にはしない
        data: Object.fromEntries(deltas.map(([field, n]) => [field, Math.max(0, current[field] + n)])),
        select,
      });
      return { candidate, counters };
    });

    // 内定済みになったら内定者管理ボードにカードを用意する (応答は待たせない)
    after(async () => {
      try {
        await onDealCandidateStageChanged(candidate.personId, stage);
      } catch (e) {
        console.warn("内定者ボードの自動作成に失敗:", e instanceof Error ? e.message : e);
      }
    });

    // 数字が変わったら企業データベース(スプシ)へも反映する (応答は待たせない)
    after(() => requestCompanyDatabaseSync());

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
    return Response.json({ ok: true, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
