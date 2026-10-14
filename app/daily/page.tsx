import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { getCoreSettings } from "@/lib/app-settings";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import { normalizeDealStatus } from "@/lib/deal-stages";
import { TEST_COMPANY_EXTERNAL_IDS, isTestCompany } from "@/lib/test-companies";
import { calcUrgency, resolveStage } from "@/lib/onboarding-flow";
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
            createdAt: true,
            deadline: true,
            notes: true,
            owner: { select: { name: true } },
            candidates: {
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                stage: true,
                note: true,
                updatedAt: true,
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

  // 内定者フォローの要対応 (内定者管理ボードと同じ判定。チェックリスト・問題記録は今は使っていないので数えない)
  const placements = await prisma.personPlacement.findMany({
    select: {
      stage: true,
      stageChangedAt: true,
      offerAcceptedAt: true,
      applicationPlannedAt: true,
      applicationAt: true,
      applicationResultAt: true,
      entryAt: true,
      joinPlannedAt: true,
      joinAt: true,
      followUpOwner: { select: { name: true } },
      person: {
        select: {
          id: true,
          name: true,
          resumeProfile: { select: { visaExpiryDate: true } },
          dealCandidates: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { deal: { select: { company: { select: { name: true, externalId: true } } } } },
          },
        },
      },
    },
  });
  const followUps = placements
    .filter((p) => !isTestCompany(p.person.dealCandidates[0]?.deal.company.externalId))
    .map((p) => {
      const urgency = calcUrgency({
        stage: resolveStage(p),
        openIssues: 0,
        overdueTasks: 0,
        nextActionDueAt: null,
        applicationPlannedAt: p.applicationPlannedAt,
        applicationAt: p.applicationAt,
        joinPlannedAt: p.joinPlannedAt,
        joinAt: p.joinAt,
        visaExpiryDate: p.person.resumeProfile?.visaExpiryDate ?? null,
        stageChangedAt: p.stageChangedAt,
      });
      // 入社・請求の工程にいる人は入社済みなので、予定日超過や滞留では要対応にしない (在留期限だけ見る)
      const reasons =
        resolveStage(p) === "joined" ? urgency.reasons.filter((r) => r.startsWith("在留期限")) : urgency.reasons;
      const level = reasons.length === 0 ? "normal" : urgency.level;
      return {
        personId: p.person.id,
        name: p.person.name,
        companyName: p.person.dealCandidates[0]?.deal.company.name ?? null,
        ownerName: p.followUpOwner?.name ?? null,
        level,
        reasons,
      };
    });

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
        followUps={followUps}
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
            // 最後に動いた日 = カンバンで候補者を最後に動かした日 (候補者がいなければ求人を作った日)。
            // 求人の更新日はステータスや担当者の一括変更でも動くので使わない
            lastActivityAt: (d
              ? d.candidates.map((x) => x.updatedAt).reduce((a, b) => (a > b ? a : b), d.createdAt)
              : null
            )?.toISOString() ?? null,
            deadline: d?.deadline?.toISOString() ?? null,
            // スプシ同期の記録行 (流入: / 入社状況:) は除く。企業詳細の表示と同じ
            memo:
              (d?.notes ?? "")
                .split("\n")
                .map((l) => l.trim())
                .find((l) => l && !/^(流入|入社状況)[:：]/.test(l)) ?? null,
            isTest: isTestCompany(c.externalId),
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
