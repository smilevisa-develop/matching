import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { getCoreSettings } from "@/lib/app-settings";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import { normalizeDealStatus, readStageDates } from "@/lib/deal-stages";
import { isTestCompany } from "@/lib/test-companies";
import { calcUrgency, resolveStage } from "@/lib/onboarding-flow";
import { computeMonthStats, currentMonthJst, isMonthKey, shiftMonth } from "@/lib/month-stats";
import DailyClient, { type DailyDeal } from "./DailyClient";

export const dynamic = "force-dynamic";

/**
 * 進捗管理 (毎日の報告 Word の置き換え)。1 求人 1 行。
 *
 * 上の数字は「選んだ月」の実績だけを数える (2026/10 採用チームの依頼。それまでは過去分も混ざっていた)。
 * 数え方: カンバンで候補者を動かしたときに入れた日付 (DealCandidate.stageDates) がその月なら 1。
 *   接続 / 面談 / 推薦 / 面接 / 内定 / 内定承諾 … その月に その段階に入った人数
 *   面接待ち … 今「推薦済み」にいる人数 (面接済みに動かすと外れる)
 *   結果待ち … 今「面接済み」にいる人数 (内定済み / 不合格に動かすと外れる)
 * 並べる島 (至急募集 / 募集中) は企業一覧の採用状況と同じ判定 (lib/deal-stages.ts)。
 * 表の数字 (人数カウンター) は求人ごとの累計で、入力は企業詳細で行う。
 */
export default async function DailyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireCurrentAccount();
  const { month: requested } = await searchParams;
  const thisMonth = currentMonthJst();
  const month = isMonthKey(requested) ? requested : thisMonth;

  const candidateSelect = {
    orderBy: { updatedAt: "desc" as const },
    select: {
      id: true,
      stage: true,
      stageDates: true,
      note: true,
      createdAt: true,
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
  };

  const [companies, settings] = await Promise.all([
    prisma.company.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        externalId: true,
        hiringStatus: true,
        deals: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            status: true,
            requiredCount: true,
            recommendedCount: true,
            interviewCount: true,
            offerCount: true,
            createdAt: true,
            deadline: true,
            notes: true,
            owner: { select: { name: true } },
            candidates: candidateSelect,
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
            select: {
              deal: { select: { owner: { select: { name: true } }, company: { select: { name: true, externalId: true } } } },
            },
          },
        },
      },
    },
  });
  const followUps = placements
    // 候補者に紐づかない内定者 (書類作成のみ) とテスト企業の人は報告に入れない
    .flatMap((p) => (p.person ? [{ ...p, person: p.person }] : []))
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
        // 内定フォロー担当がいなければ、その企業の担当者 (採用担当) を出す
        ownerName: p.followUpOwner?.name ?? p.person.dealCandidates[0]?.deal.owner?.name ?? null,
        level,
        reasons,
      };
    });

  const target = settings.monthlyTargets.find((t) => t.month === month);

  // ── 選んだ月の実績 (lib/month-stats.ts。KPI シートへの転記と同じ数え方) ──
  const stats = await computeMonthStats(month);

  const rows: DailyDeal[] = [];
  for (const c of [...companies].sort(byExternalId)) {
    const multi = c.deals.length > 1;
    // 求人がまだ無い企業 (追加してから一度も開いていない) も、企業の採用状況で並べる
    const dealsOrEmpty = c.deals.length > 0 ? c.deals : [null];
    for (const d of dealsOrEmpty) {
      rows.push({
        rowKey: d ? `deal-${d.id}` : `company-${c.id}`,
        companyId: c.id,
        dealTitle: d && multi ? d.title : null,
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
        lastActivityAt:
          (d ? d.candidates.map((x) => x.updatedAt).reduce((a, b) => (a > b ? a : b), d.createdAt) : null)?.toISOString() ??
          null,
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
          // 今のステージに入った日 (月で表示を絞るのに使う。記録が無い古いデータは null)
          stageDate: readStageDates(cand.stageDates)[cand.stage] ?? null,
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
      });
    }
  }

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const monthLabel = (m: string) => (m.startsWith(thisMonth.slice(0, 4)) ? `${Number(m.slice(5))}月` : `${m.slice(0, 4)}年${Number(m.slice(5))}月`);

  return (
    <div className="space-y-5 p-8">
      <RefreshOnFocus />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="flex items-baseline gap-3 text-2xl font-bold text-[var(--color-text-dark)]">
          進捗管理
          <span className="text-4xl text-[var(--color-primary)]">{monthLabel(month)}</span>
        </h1>
        {/* 月の切り替え (前月 ← → 翌月)。URL に ?month=YYYY-MM が付くので、そのまま共有できる */}
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/daily?month=${prev}`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            ← {monthLabel(prev)}
          </Link>
          {month !== thisMonth ? (
            <Link href="/daily" className="rounded-lg px-3 py-1 text-gray-500 underline decoration-dotted hover:text-[var(--color-primary)]">
              今月
            </Link>
          ) : null}
          <Link
            href={`/daily?month=${next}`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {monthLabel(next)} →
          </Link>
        </nav>
      </div>
      <DailyClient
        month={month}
        stats={stats}
        offerTarget={target?.offer ?? settings.monthlyOfferTarget}
        recommendTarget={target?.recommendCount ?? null}
        followUps={followUps}
        deals={rows}
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
