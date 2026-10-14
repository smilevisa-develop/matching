import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import DailyClient from "./DailyClient";

export const dynamic = "force-dynamic";

/** 求人進捗 (毎日の報告 Word の置き換え)。1 求人 1 行で、数字とメモだけを更新する。 */
export default async function DailyPage() {
  const account = await requireCurrentAccount();
  const deals = await prisma.deal.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      notes: true,
      recommendedCount: true,
      interviewCount: true,
      offerCount: true,
      company: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-5 p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">求人進捗</h1>
      <DailyClient
        myName={account.name}
        initialDeals={deals.map((d) => ({
          id: d.id,
          title: d.title,
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
