"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import CandidateKanban, {
  confirmRemoveCandidate,
  removeCandidateFromKanban,
  type CandidateCard,
} from "@/app/components/CandidateKanban";
import { dealGroup } from "@/lib/deal-stages";
import { isTestCompany } from "@/lib/test-companies";
import { buildDailyReport, type ReportFollowUp } from "@/lib/daily-report";
import type { MonthStats } from "@/lib/month-stats";

export type DailyDeal = {
  /** 行のキー (求人があれば deal-ID、無ければ company-ID) */
  rowKey: string;
  companyId: number;
  /** 同じ企業に求人が複数あるときだけ、求人名を企業名の下に出す */
  dealTitle: string | null;
  /** 企業詳細へのリンク */
  href: string;
  status: string;
  requiredCount: number;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  companyExternalId: string | null;
  companyName: string;
  /** 通常 / 人材紹介会社 (人材紹介会社はカンバンが 入社待ち・入社済み になる) */
  companyKind: string;
  ownerName: string | null;
  lastActivityAt: string | null;
  deadline: string | null;
  memo: string | null;
  isTest: boolean;
  /** stageDate = 今のステージに入った日 (YYYY-MM-DD)。記録が無い古いデータは null */
  candidates: (CandidateCard & { stageDate?: string | null })[];
};

/**
 * 月に関係なくカンバンに出す「進行中」のステージ。対応が今も必要な人。
 * それ以外 (内定・内定承諾・辞退・NG・不合格 = 終わった人) は、そのステージに入った日が選んだ月の人だけ出す。
 * 日付の記録が無い終わった人 (2026/10/19 より前の動き) は過去の人として隠す。
 */
const IN_PROGRESS_STAGES = new Set(["接続済み", "事前面談済み", "推薦済み", "面接済み", "入社待ち"]);

type CountKey = "requiredCount" | "recommendedCount" | "interviewCount" | "offerCount";

const COUNTS: { key: CountKey; label: string }[] = [
  { key: "requiredCount", label: "募集人数" },
  // 企業ごとの累計 (月ごとではない)。上部の「今月の内定」と区別するため見出しに付ける
  { key: "recommendedCount", label: "推薦累計" },
  { key: "interviewCount", label: "面接累計" },
  { key: "offerCount", label: "内定累計" },
];

export default function DailyClient({
  deals,
  month,
  stats,
  offerTarget,
  recommendTarget,
  followUps,
}: {
  deals: DailyDeal[];
  /** 表示している月 (YYYY-MM) */
  month: string;
  /** その月の実績 */
  stats: MonthStats;
  /** 内定者フォローの状態 (要対応の判定つき) */
  followUps: ReportFollowUp[];
  offerTarget: number | null;
  recommendTarget: number | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  // 過去に終わった人 (前の月までに内定・NG になった人) もカンバンに出すか
  const [showPast, setShowPast] = useState(false);
  // ドラッグ直後の見た目用。サーバーの内容 (from) が変わった時点で使われなくなる
  const [moved, setMoved] = useState<Record<number, { from: string; to: string }>>({});
  const stageOf = (c: CandidateCard) => (moved[c.id]?.from === c.stage ? moved[c.id].to : c.stage);

  const urgent = deals.filter((d) => dealGroup(d.status) === "urgent");
  const open = deals.filter((d) => dealGroup(d.status) === "open");
  const active = [...urgent, ...open];
  // テスト企業は一覧には出すが、上部の数字には含めない
  const counted = active.filter((d) => !isTestCompany(d.companyExternalId));

  // 企業詳細のカンバンと同じ API。人数カウンターもサーバー側で連動する
  const moveCandidate = async (candidateId: number, stage: string, date: string | null) => {
    const from = deals.flatMap((d) => d.candidates).find((c) => c.id === candidateId)?.stage;
    if (from === undefined || from === stage) return;
    setMoved((cur) => ({ ...cur, [candidateId]: { from, to: stage } }));
    const res = await fetch(`/api/deal-candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, date }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setMoved((cur) => {
        const next = { ...cur };
        delete next[candidateId];
        return next;
      });
      alert(data.error || "候補者ステップの更新に失敗しました");
      return;
    }
    router.refresh();
  };

  // 外したカード (サーバーの内容を取り直すまでの見た目用)
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const removeCandidate = async (candidate: CandidateCard) => {
    if (!confirmRemoveCandidate(candidate)) return;
    if (!(await removeCandidateFromKanban(candidate.id))) return;
    setRemoved((cur) => new Set(cur).add(candidate.id));
    router.refresh();
  };

  const island = (title: string, rows: DailyDeal[]) => (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
              <th className="w-24 px-4 py-3 text-left font-semibold">企業ID</th>
              <th className="px-4 py-3 text-left font-semibold">企業名</th>
              <th className="w-28 px-4 py-3 text-left font-semibold">担当</th>
              {COUNTS.map((c) => (
                <th key={c.key} className="w-20 whitespace-nowrap px-2 py-3 text-center font-semibold">
                  {c.label}
                </th>
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d, idx) => {
              // 同じ企業の 2 行目以降 (案件が複数ある企業) は区切り線を点線にして、同じ企業と分かるようにする
              const continued = idx > 0 && rows[idx - 1].companyId === d.companyId;
              return (
              <Fragment key={d.rowKey}>
                <tr
                  onClick={() => setOpenId((cur) => (cur === d.rowKey ? null : d.rowKey))}
                  className={`cursor-pointer hover:bg-gray-50 ${continued ? "border-t border-dashed border-gray-100" : "border-t border-gray-100"} ${
                    openId === d.rowKey ? "bg-gray-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-[13px] text-[var(--color-primary)]">
                    {d.companyExternalId ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--color-text-dark)]">
                    {d.companyName}
                    {/* 案件が複数ある企業は 1 案件 1 行で、各行とも企業名の下に案件名を 2 段目で出す */}
                    {d.dealTitle ? <span className="mt-0.5 block text-xs font-normal text-gray-500">{d.dealTitle}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.ownerName ?? "-"}</td>
                  {COUNTS.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-3 text-center tabular-nums ${
                        d[c.key] > 0 ? "font-semibold text-[var(--color-text-dark)]" : "text-gray-300"
                      }`}
                    >
                      {d[c.key]}
                    </td>
                  ))}
                  <td className="p-0 text-center">
                    <Link
                      href={d.href}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${d.companyName} の詳細を開く`}
                      className="block px-3 py-3 text-lg leading-none text-gray-400 hover:text-[var(--color-primary)]"
                    >
                      →
                    </Link>
                  </td>
                </tr>
                {openId === d.rowKey ? (
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={COUNTS.length + 4} className="px-4 py-3">
                      {/* 表のセルは中身に合わせて広がるので、幅 0 + 最小幅 100% にして表の幅を押し広げないようにする */}
                      <div className="w-0 min-w-full">
                      {(() => {
                        const all = d.candidates
                          .filter((c) => !removed.has(c.id))
                          .map((c) => ({ ...c, stage: stageOf(c) }));
                        // この画面で動かした人はその場で見えるように残す
                        const shown = showPast
                          ? all
                          : all.filter(
                              (c) =>
                                IN_PROGRESS_STAGES.has(c.stage) ||
                                Boolean(moved[c.id]) ||
                                Boolean(c.stageDate && c.stageDate.startsWith(month)),
                            );
                        const hidden = all.length - shown.length;
                        return (
                          <>
                            <CandidateKanban
                              companyKind={d.companyKind}
                              candidates={shown}
                              onMove={(id, stage, date) => void moveCandidate(id, stage, date)}
                              onRemove={(candidate) => void removeCandidate(candidate)}
                            />
                            {hidden > 0 || showPast ? (
                              <p className="mt-2 text-[11px] text-gray-500">
                                {showPast
                                  ? "過去に内定・NG になった人も表示しています。"
                                  : `前の月までに内定・NG などで終わった ${hidden} 名は隠しています。`}
                                <button
                                  type="button"
                                  onClick={() => setShowPast((v) => !v)}
                                  className="ml-2 text-[var(--color-primary)] underline decoration-dotted"
                                >
                                  {showPast ? "隠す" : "過去分も表示"}
                                </button>
                              </p>
                            ) : null}
                          </>
                        );
                      })()}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COUNTS.length + 4} className="px-4 py-8 text-center text-gray-400">
                  なし
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  const [copied, setCopied] = useState(false);
  // Slack にそのまま貼れる報告文 (要対応を先頭に、順調なものは 1 行ずつ)
  const copyReport = async () => {
    const text = buildDailyReport({
      date: new Date(),
      offersThisMonth: stats.offers,
      offerTarget,
      companies: deals,
      followUps,
      url: `${window.location.origin}/daily?month=${month}`,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("コピーできなかったので、ここから選択してコピーしてください", text);
    }
  };

  return (
    <div className="space-y-5">
      {/* 主役は「内定の数と達成率」。他の数字はその下に小さく並べる (内定承諾は出さない) */}
      <div className="flex flex-wrap items-stretch gap-4">
        <OfferHero value={stats.offers} target={offerTarget} />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void copyReport()}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              {copied ? "コピーしました ✓" : "Slack 用にコピー"}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-500">
            <MiniStat label="推薦" value={stats.recommended} target={recommendTarget} />
            <MiniStat label="面接" value={stats.interviewed} />
            <MiniStat label="面談" value={stats.preInterviewed} />
            <MiniStat label="接続" value={stats.connected} />
            <MiniStat label="面接待ち" value={stats.waitingInterview} title="今 推薦済みの人数" />
            <MiniStat label="結果待ち" value={stats.waitingResult} title="今 面接済みの人数" />
            <MiniStat label="募集中" value={counted.length} unit="社" />
          </div>
        </div>
      </div>
      {island("至急募集", urgent)}
      {island("募集中", open)}
    </div>
  );
}

/** 今月の内定 (大きく)。目標があれば「現状 / 目標」と達成率。目標の数字を押すと設定の月次目標へ飛ぶ */
function OfferHero({ value, target }: { value: number; target: number | null }) {
  const rate = target && target > 0 ? Math.round((value / target) * 100) : null;
  const barColor = rate === null ? "" : rate >= 100 ? "bg-emerald-500" : rate >= 50 ? "bg-[var(--color-primary)]" : "bg-amber-500";
  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm sm:w-[360px]">
      <p className="text-sm font-semibold text-gray-500">内定</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="tabular-nums leading-none text-[var(--color-text-dark)]">
          <span className="text-5xl font-bold">{value}</span>
          <Link
            href="/settings#monthly-targets"
            className="ml-2 text-lg font-medium text-gray-400 underline decoration-dotted underline-offset-4 hover:text-[var(--color-primary)]"
          >
            {target && target > 0 ? `/ ${target} 名` : "/ 目標を設定"}
          </Link>
        </p>
        {rate !== null ? (
          <p className={`text-4xl font-bold tabular-nums ${rate >= 100 ? "text-emerald-600" : "text-[var(--color-text-dark)]"}`}>{rate}%</p>
        ) : null}
      </div>
      {rate !== null ? (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/** そのほかの数字 (小さく 1 行に並べる) */
function MiniStat({
  label,
  value,
  target,
  unit,
  title,
}: {
  label: string;
  value: number;
  target?: number | null;
  unit?: string;
  title?: string;
}) {
  return (
    <span className="whitespace-nowrap" title={title}>
      {label}
      <span className="ml-1 text-sm font-semibold tabular-nums text-[var(--color-text-dark)]">{value}</span>
      {target && target > 0 ? <span className="tabular-nums text-gray-400"> / {target}</span> : null}
      {unit ? <span className="ml-0.5">{unit}</span> : null}
    </span>
  );
}
