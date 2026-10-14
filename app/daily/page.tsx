import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { getCoreSettings } from "@/lib/app-settings";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import { normalizeDealStatus } from "@/lib/deal-stages";
import { TEST_COMPANY_EXTERNAL_IDS } from "@/lib/test-companies";
import DailyClient from "./DailyClient";

export const dynamic = "force-dynamic";

/**
 * 進捗管理 (毎日の報告 Word の置き換え)。1 企業 1 行。
 * 1 企業 = 1 求人の運用なので、企業を開いたときと同じく最後に更新した Deal を使う。
 * 並べる島 (至急募集 / 募集中) は企業一覧の採用状況と同じ判定 (lib/deal-stages.ts)。
 * 数字 (人数カウンター) と候補者の状態は企業詳細と同じデータで、入力は企業詳細で行う。
 */
export default async function DailyPage() {
  await requireCurrentAccount();
  const [companies, settings] = await Promise.all([
    prisma.company.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        externalId: true,
        hiringStatus: true,
        deals: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            requiredCount: true,
            recommendedCount: true,
            interviewCount: true,
            offerCount: true,
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
        },
      },
    }),
    getCoreSettings(),
  ]);

  // 月は日本時間で決める (サーバーは UTC で動いている)
  const [year, monthNo] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-");
  const target = settings.monthlyTargets.find((t) => t.month === `${year}-${monthNo}`);

  // 今月の内定 = 内定日 (無ければ内定承諾日) が今月 (日本時間) の内定者。人数カウンターは累計なので使わない
  const monthStart = new Date(Date.UTC(Number(year), Number(monthNo) - 1, 1) - 9 * 3600_000);
  const nextMonthStart = new Date(Date.UTC(Number(year), Number(monthNo), 1) - 9 * 3600_000);
  const inMonth = { gte: monthStart, lt: nextMonthStart };
  const offersThisMonth = await prisma.personPlacement.count({
    where: {
      OR: [{ offerAt: inMonth }, { offerAt: null, offerAcceptedAt: inMonth }],
      // テスト企業だけに紐づく人は数えない
      person: { dealCandidates: { some: { deal: { company: { NOT: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } } } } },
    },
  });

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
        offersThisMonth={offersThisMonth}
        deals={[...companies].sort(byExternalId).map((c) => {
          // 求人がまだ無い企業 (追加してから一度も開いていない) も、企業の採用状況で並べる
          const d = c.deals[0];
          return {
            companyId: c.id,
            href: d ? `/companies/deals/${d.id}` : `/companies/${c.id}`,
            status: normalizeDealStatus(d?.status ?? c.hiringStatus),
            requiredCount: d?.requiredCount ?? 0,
            recommendedCount: d?.recommendedCount ?? 0,
            interviewCount: d?.interviewCount ?? 0,
            offerCount: d?.offerCount ?? 0,
            companyExternalId: c.externalId,
            companyName: c.name,
            ownerName: d?.owner?.name ?? null,
            candidates: (d?.candidates ?? []).map((cand) => ({
              id: cand.id,
              note: cand.note,
              stage: cand.stage,
              person: {
                id: cand.person.id,
                name: cand.person.name,
                englishName: cand.person.onboarding?.englishName ?? null,
                nationality: cand.person.nationality,
                residenceStatus: cand.person.residenceStatus,
                photoUrl: cand.person.photoUrl,
                partner: cand.person.partner,
              },
            })),
          };
        })}
      />
    </div>
  );
}

/** 企業ID順 (番号の小さい順。番号の無い ID は後ろ) */
function byExternalId(a: { externalId: string | null }, b: { externalId: string | null }) {
  const key = (id: string | null) => {
    const m = (id ?? "").match(/^(\d+)(.*)$/);
    return m ? [0, Number(m[1]), m[2]] as const : [1, 0, id ?? ""] as const;
  };
  const ka = key(a.externalId);
  const kb = key(b.externalId);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
}
