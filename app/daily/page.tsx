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
  await requireCurrentAccount();
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
            note: true,
            person: {
              select: {
                id: true,
                name: true,
                nationality: true,
                residenceStatus: true,
                photoUrl: true,
                partner: { select: { id: true, name: true } },
                onboarding: { select: { englishName: true } },
              },
            },
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

  // 月は日本時間で決める (サーバーは UTC で動いている)
  const [year, monthNo] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-");
  const target = settings.monthlyTargets.find((t) => t.month === `${year}-${monthNo}`);

  return (
    <div className="space-y-5 p-8">
      <RefreshOnFocus />
      <h1 className="flex items-baseline gap-3 text-2xl font-bold text-[var(--color-text-dark)]">
        進捗管理
        <span className="text-4xl text-[var(--color-primary)]">{Number(monthNo)}月</span>
      </h1>
      <DailyClient
        offerTarget={target?.offer ?? settings.monthlyOfferTarget}
        recommendTarget={target?.recommendCount ?? null}
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
            note: c.note,
            stage: c.stage,
            person: {
              id: c.person.id,
              name: c.person.name,
              englishName: c.person.onboarding?.englishName ?? null,
              nationality: c.person.nationality,
              residenceStatus: c.person.residenceStatus,
              photoUrl: c.person.photoUrl,
              partner: c.person.partner,
            },
          })),
        }))}
      />
    </div>
  );
}
