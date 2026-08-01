import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import RecommendationsClient from "./RecommendationsClient";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  await requireCurrentAccount();
  const deals = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      company: { select: { name: true } },
      _count: { select: { candidates: true } },
    },
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">推薦リスト作成</h1>
        <p className="mt-1 text-sm text-gray-500">
          求人を選択すると、その求人に紐づく候補者の推薦リストを CSV でダウンロードできます。
        </p>
      </div>

      <RecommendationsClient
        deals={deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          companyName: deal.company.name,
          candidateCount: deal._count.candidates,
        }))}
      />
    </div>
  );
}
