/**
 * 候補者詳細の「推薦先企業」(要ログイン)。
 *
 * POST /api/personnel/[id]/recommended-company
 *   body: { companyId: number | null, removeCompanyId?: number | null }
 *     companyId       … この企業のカンバンに候補者を入れる (既にいれば何もしない。新規は「接続済み」)
 *     removeCompanyId … この企業のカンバンから候補者を外す (推薦先を変えた / 取り消したとき)
 *
 * 企業のカンバン (DealCandidate) と同じデータを直接動かすので、企業詳細・進捗管理にもそのまま反映される。
 * 外すときは、そのカードで数えた人数カウンター (推薦・面接・内定など) も戻す。
 * 推薦先はカンバンの紐づけから決まるので、手入力の推薦先 (Person.recommendedCompany) は消す。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { normalizeDealStatus, stageCounterDeltas, type CounterField } from "@/lib/deal-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toId = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const companyId = toId(body?.companyId);
    const removeCompanyId = toId(body?.removeCompanyId);

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (removeCompanyId && removeCompanyId !== companyId) {
        const links = await tx.dealCandidate.findMany({
          where: { personId, deal: { companyId: removeCompanyId } },
          select: { id: true, stage: true, dealId: true },
        });
        for (const link of links) {
          // カードを「接続済み」まで戻したのと同じだけ、人数カウンターを戻す
          const deltas = Object.entries(stageCounterDeltas(link.stage, "接続済み")) as [CounterField, number][];
          if (deltas.length > 0) {
            const deal = await tx.deal.findUniqueOrThrow({ where: { id: link.dealId } });
            await tx.deal.update({
              where: { id: link.dealId },
              data: Object.fromEntries(deltas.map(([f, n]) => [f, Math.max(0, deal[f] + n)])),
            });
          }
          await tx.dealCandidate.delete({ where: { id: link.id } });
        }
      }

      if (companyId) {
        const company = await tx.company.findUniqueOrThrow({
          where: { id: companyId },
          select: { id: true, name: true, hiringStatus: true },
        });
        // 1 企業 = 1 求人。企業を開いたときと同じく最後に更新した求人を使い、無ければ作る
        const deal =
          (await tx.deal.findFirst({
            where: { companyId },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          })) ??
          (await tx.deal.create({
            data: { title: company.name, companyId, status: normalizeDealStatus(company.hiringStatus) },
            select: { id: true },
          }));
        await tx.dealCandidate.upsert({
          where: { dealId_personId: { dealId: deal.id, personId } },
          create: { dealId: deal.id, personId, stage: "接続済み" },
          // 既に入っていたときも、今の推薦先として先頭に来るよう更新日時だけ進める
          update: { updatedAt: new Date() },
        });
      }

      await tx.person.update({ where: { id: personId }, data: { recommendedCompany: null } });
    });

    after(() => requestCompanyDatabaseSync());

    const links = await prisma.dealCandidate.findMany({
      where: { personId },
      orderBy: { updatedAt: "desc" },
      select: { stage: true, deal: { select: { id: true, company: { select: { id: true } } } } },
    });
    return Response.json({
      ok: true,
      links: links.map((l) => ({ companyId: l.deal.company.id, dealId: l.deal.id, stage: l.stage })),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
