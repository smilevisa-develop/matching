"use client";

import Link from "next/link";
import { useState } from "react";

export type BillingTaskRow = {
  id: number;
  placementId: number;
  step: string;
  title: string;
  dueAt: string;
  done: boolean;
  doneAt: string;
  doneBy: string;
  owner: string;
  personName: string;
  companyName: string;
  partnerName: string;
  joinAt: string;
  overdue: boolean;
};

type Step = { key: string; label: string; role: string; partnerOnly: boolean };

const ROLE_LABEL: Record<string, string> = { accounting: "経理担当", recruiter: "採用担当" };
const slash = (ymd: string) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "");

/** 請求管理: 月ごとのやることを、流れの順 (請求 → 入金確認 → パートナーへ依頼 → 受け取り → 支払い) に並べる */
export default function BillingClient({
  rows: initial,
  steps,
  me,
  staff,
  billingOwnerId,
  accountingOwner,
}: {
  rows: BillingTaskRow[];
  steps: Step[];
  me: string;
  staff: { id: number; name: string }[];
  billingOwnerId: number | null;
  accountingOwner: string;
}) {
  const [rows, setRows] = useState(initial);
  const [mine, setMine] = useState(false);
  const [ownerId, setOwnerId] = useState(billingOwnerId ? String(billingOwnerId) : "");

  const visible = rows.filter((r) => !mine || r.owner === me);
  const overdue = visible.filter((r) => r.overdue);
  const thisMonth = visible.filter((r) => !r.overdue);
  const left = thisMonth.filter((r) => !r.done).length;

  const toggle = async (row: BillingTaskRow) => {
    const done = !row.done;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, done } : r)));
    const res = await fetch(`/api/onboarding/tasks/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, done: row.done } : r)));
      alert("保存に失敗しました");
    }
  };

  const saveOwner = async (value: string) => {
    setOwnerId(value);
    const res = await fetch("/api/billing/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingOwnerId: value ? Number(value) : null }),
    });
    if (!res.ok) alert("保存に失敗しました");
    else window.location.reload();
  };

  const table = (list: BillingTaskRow[]) => (
    <ul className="divide-y divide-gray-100">
      {list.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <button
            type="button"
            onClick={() => void toggle(r)}
            aria-pressed={r.done}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              r.done ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-gray-300 bg-white"
            }`}
          >
            {r.done ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </button>
          <span className={`w-14 shrink-0 text-sm font-semibold tabular-nums ${r.overdue ? "text-red-600" : "text-gray-700"}`}>{slash(r.dueAt)}</span>
          <Link
            href={`/onboarding?open=${r.placementId}`}
            className={`min-w-0 flex-1 text-sm ${r.done ? "text-gray-400 line-through" : "text-[var(--color-text-dark)]"} hover:underline`}
          >
            <span className="font-semibold">{r.personName}</span>
            <span className="ml-2 text-xs text-gray-500">
              {[r.companyName, r.joinAt ? `${slash(r.joinAt)} 入社` : "", r.partnerName ? `パートナー: ${r.partnerName}` : ""].filter(Boolean).join(" ・ ")}
            </span>
          </Link>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${r.owner === me ? "bg-[var(--color-light)] font-semibold text-[var(--color-primary)]" : "bg-gray-100 text-gray-600"}`}>
            {r.owner || "担当未定"}
          </span>
          {r.done && r.doneBy ? <span className="shrink-0 text-[11px] text-gray-400">{slash(r.doneAt)} {r.doneBy}</span> : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--color-text-dark)]">今月の残り {left} 件</span>
        <label className="flex items-center gap-1.5 text-gray-600">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          自分の分だけ
        </label>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          経理担当 (請求書・入金確認・パートナーへの支払い)
          <select value={ownerId} onChange={(e) => void saveOwner(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-800">
            <option value="">管理者 ({accountingOwner || "-"})</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500">
        流れ: 入社 → 翌月 1 日に企業へ請求 → その月末に入金 → 入金を確認したらパートナーに請求書を依頼 → 入金の翌月末までにパートナーへ支払い。
        パートナーへの依頼・受け取りは採用担当 (求人の担当者)。終えたら企業データベースの請求管理に日付・状況が入ります。
      </p>

      {overdue.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-700">期限が過ぎて終わっていないもの ({overdue.length})</h2>
          {table(overdue)}
        </section>
      ) : null}

      {steps.map((step) => {
        const list = thisMonth.filter((r) => r.step === step.key);
        return (
          <section key={step.key} className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold text-[var(--color-text-dark)]">
              {step.label}
              <span className="text-xs font-normal text-gray-500">{ROLE_LABEL[step.role]}</span>
              <span className="text-xs font-normal text-gray-400">
                {list.filter((r) => r.done).length} / {list.length}
              </span>
            </h2>
            {list.length > 0 ? table(list) : <p className="py-2 text-xs text-gray-400">この月はありません</p>}
          </section>
        );
      })}
    </div>
  );
}
