import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { getCoreSettings } from "@/lib/app-settings";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import DailyClient from "./DailyClient";

export const dynamic = "force-dynamic";

/**
 * 進捗管理 (毎日の報告 Word の置き換え)。1 企業 1 行。
 * 1 企業 = 1 求人の運用なので、企業を開いたときと同じく最後に更新した Deal を使う。
 * 数字 (人数カウンター) と候補者の状態は企業詳細と同じデータで、入力は企業詳細で行う。
 */
export default async function DailyPage() {
  const account = await requireCurrentAccount();
  const [deals, settings] = await Promise.all([
    prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        companyId: true,
        status: true,
        requiredCount: true,
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        company: { select: { name: true, externalId: true } },
        owner: { select: { name: true } },
        candidates: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            stage: true,
            person: { select: { id: true, name: true, onboarding: { select: { englishName: true } } } },
          },
        },
      },
    }),
    getCoreSettings(),
  ]);

  const seen = new Set<number>();
  const rows = deals
    .filter((d) => !seen.has(d.companyId) && seen.add(d.companyId))
    .sort((a, b) => a.id - b.id);

  const month = new Date().toISOString().slice(0, 7);
  const offerTarget =
    settings.monthlyTargets.find((t) => t.month === month)?.offer ?? settings.monthlyOfferTarget;

  return (
    <div className="space-y-5 p-8">
      <RefreshOnFocus />
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">進捗管理</h1>
      <DailyClient
        myName={account.name}
        offerTarget={offerTarget}
        deals={rows.map((d) => ({
          id: d.id,
          status: d.status,
          requiredCount: d.requiredCount,
          recommendedCount: d.recommendedCount,
          interviewCount: d.interviewCount,
          offerCount: d.offerCount,
          companyExternalId: d.company.externalId,
          companyName: d.company.name,
          ownerName: d.owner?.name ?? null,
          candidates: d.candidates.map((c) => ({
            id: c.id,
            stage: c.stage,
            personId: c.person.id,
            name: c.person.onboarding?.englishName?.trim() || c.person.name,
          })),
        }))}
      />
    </div>
  );
}
