import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import DailyClient from "./DailyClient";

export const dynamic = "force-dynamic";

/**
 * デイリー報告 (毎日の報告 Word の置き換え)。1 企業 1 行で、数字とメモだけを更新する。
 * 1 企業 = 1 求人の運用なので、企業を開いたときと同じく最後に更新した Deal を使う。
 */
export default async function DailyPage() {
  const account = await requireCurrentAccount();
  const deals = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyId: true,
      status: true,
      notes: true,
      recommendedCount: true,
      interviewCount: true,
      offerCount: true,
      company: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });

  const seen = new Set<number>();
  const rows = deals
    .filter((d) => !seen.has(d.companyId) && seen.add(d.companyId))
    .sort((a, b) => a.id - b.id);

  return (
    <div className="space-y-5 p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">デイリー報告</h1>
      <DailyClient
        myName={account.name}
        initialDeals={rows.map((d) => ({
          id: d.id,
          status: d.status,
          notes: d.notes ?? "",
          recommendedCount: d.recommendedCount,
          interviewCount: d.interviewCount,
          offerCount: d.offerCount,
          companyName: d.company.name,
          ownerName: d.owner?.name ?? null,
        }))}
      />
    </div>
  );
}
