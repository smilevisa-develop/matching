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
  ownerName: string | null;
  lastActivityAt: string | null;
  deadline: string | null;
  memo: string | null;
  isTest: boolean;
  candidates: CandidateCard[];
};

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
              // 同じ企業の 2 行目以降 (案件が複数ある企業)。各行に企業名を出すが、注記は 1 行目だけ
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
                    {/* 案件が複数ある企業は、各行に企業名 + 案件名を出す (1 件しか無いように見えないように) */}
                    {d.dealTitle ? (
                      <span className="mt-0.5 block text-xs font-normal text-gray-500">
                        案件: {d.dealTitle}
                        {continued ? null : <span className="ml-1 text-gray-400">(複数の案件あり)</span>}
                      </span>
                    ) : null}
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
                      <CandidateKanban
                        candidates={d.candidates
                          .filter((c) => !removed.has(c.id))
                          .map((c) => ({ ...c, stage: stageOf(c) }))}
                        onMove={(id, stage, date) => void moveCandidate(id, stage, date)}
                        onRemove={(candidate) => void removeCandidate(candidate)}
                      />
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void copyReport()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          {copied ? "コピーしました ✓" : "Slack 用にコピー"}
        </button>
      </div>
      {/* 選んだ月の実績。目標は 設定 → 月次目標 (推薦・内定)。面接待ち / 結果待ちだけは「今の状態」 */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-9">
        <Kpi label="接続" value={stats.connected} target={null} />
        <Kpi label="面談" value={stats.preInterviewed} target={null} />
        <Kpi label="推薦" value={stats.recommended} target={recommendTarget} editable />
        <Kpi label="面接待ち" value={stats.waitingInterview} target={null} hint="今 推薦済み" />
        <Kpi label="面接" value={stats.interviewed} target={null} />
        <Kpi label="結果待ち" value={stats.waitingResult} target={null} hint="今 面接済み" />
        <Kpi label="内定" value={stats.offers} target={offerTarget} editable />
        <Kpi label="内定承諾" value={stats.accepted} target={null} />
        <Kpi label="募集中" value={counted.length} target={null} hint="社" />
      </div>
      {island("至急募集", urgent)}
      {island("募集中", open)}
    </div>
  );
}

/** 数字 1 つ。目標があれば「現状 / 目標」と達成率のバーを出す。目標の数字を押すと設定の月次目標へ飛ぶ */
function Kpi({
  label,
  value,
  target,
  editable = false,
  hint,
}: {
  label: string;
  value: number;
  target: number | null;
  editable?: boolean;
  /** 数字の横に小さく出す補足 (例: 今 推薦済み) */
  hint?: string;
}) {
  const rate = target && target > 0 ? Math.round((value / target) * 100) : null;
  const barColor = rate === null ? "" : rate >= 100 ? "bg-emerald-500" : rate >= 50 ? "bg-[var(--color-primary)]" : "bg-amber-500";
  const targetText = rate !== null ? `/ ${target}` : editable ? "/ 目標を設定" : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs text-gray-500">{label}</p>
        {rate !== null ? (
          <p className="text-sm font-bold tabular-nums text-[var(--color-text-dark)]">{rate}%</p>
        ) : null}
      </div>
      <p className="text-xl font-bold tabular-nums leading-tight text-[var(--color-text-dark)]">
        {value}
        {targetText && editable ? (
          <Link
            href="/settings#monthly-targets"
            className="ml-1 text-sm font-medium text-gray-400 underline decoration-dotted underline-offset-2 hover:text-[var(--color-primary)]"
          >
            {targetText}
          </Link>
        ) : targetText ? (
          <span className="ml-1 text-sm font-medium text-gray-400">{targetText}</span>
        ) : hint ? (
          <span className="ml-1 text-[11px] font-medium text-gray-400">{hint}</span>
        ) : null}
      </p>
      {rate !== null ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
