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

export type DailyDeal = {
  companyId: number;
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
  offerTarget,
  recommendTarget,
  offersThisMonth,
}: {
  deals: DailyDeal[];
  /** 今月 (日本時間) に内定日がある内定者の数 */
  offersThisMonth: number;
  offerTarget: number | null;
  recommendTarget: number | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  // ドラッグ直後の見た目用。サーバーの内容 (from) が変わった時点で使われなくなる
  const [moved, setMoved] = useState<Record<number, { from: string; to: string }>>({});
  const stageOf = (c: CandidateCard) => (moved[c.id]?.from === c.stage ? moved[c.id].to : c.stage);

  const urgent = deals.filter((d) => dealGroup(d.status) === "urgent");
  const open = deals.filter((d) => dealGroup(d.status) === "open");
  const active = [...urgent, ...open];
  // テスト企業は一覧には出すが、上部の数字には含めない
  const counted = active.filter((d) => !isTestCompany(d.companyExternalId));
  const sum = (key: CountKey) => counted.reduce((n, d) => n + d[key], 0);

  // 企業詳細のカンバンと同じ API。人数カウンターもサーバー側で連動する
  const moveCandidate = async (candidateId: number, stage: string) => {
    const from = deals.flatMap((d) => d.candidates).find((c) => c.id === candidateId)?.stage;
    if (from === undefined || from === stage) return;
    setMoved((cur) => ({ ...cur, [candidateId]: { from, to: stage } }));
    const res = await fetch(`/api/deal-candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
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
            {rows.map((d) => (
              <Fragment key={d.companyId}>
                <tr
                  onClick={() => setOpenId((cur) => (cur === d.companyId ? null : d.companyId))}
                  className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${
                    openId === d.companyId ? "bg-gray-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-[13px] text-[var(--color-primary)]">
                    {d.companyExternalId ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--color-text-dark)]">{d.companyName}</td>
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
                {openId === d.companyId ? (
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={COUNTS.length + 4} className="px-4 py-3">
                      <CandidateKanban
                        candidates={d.candidates
                          .filter((c) => !removed.has(c.id))
                          .map((c) => ({ ...c, stage: stageOf(c) }))}
                        onMove={(id, stage) => void moveCandidate(id, stage)}
                        onRemove={(candidate) => void removeCandidate(candidate)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="今月の内定" value={offersThisMonth} target={offerTarget} editable />
        <Kpi label="推薦" value={sum("recommendedCount")} target={recommendTarget} editable />
        <Kpi label="面接" value={sum("interviewCount")} target={null} />
        <Kpi label="募集中の企業" value={counted.length} target={null} />
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
}: {
  label: string;
  value: number;
  target: number | null;
  editable?: boolean;
}) {
  const rate = target && target > 0 ? Math.round((value / target) * 100) : null;
  const barColor = rate === null ? "" : rate >= 100 ? "bg-emerald-500" : rate >= 50 ? "bg-[var(--color-primary)]" : "bg-amber-500";
  const targetText = rate !== null ? `/ ${target}` : editable ? "/ 目標を設定" : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500">{label}</p>
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
