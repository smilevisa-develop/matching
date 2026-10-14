"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type DailyDeal = {
  id: number;
  title: string;
  status: string;
  notes: string;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  companyName: string;
  ownerName: string | null;
};

type CountKey = "recommendedCount" | "interviewCount" | "offerCount";

const COUNTS: { key: CountKey; label: string }[] = [
  { key: "recommendedCount", label: "推薦" },
  { key: "interviewCount", label: "面接" },
  { key: "offerCount", label: "内定" },
];

// 成約・クローズは「ストップ」側にまとめる (Word の「ストップ案件リスト」と同じ扱い)
const STOPPED = ["成約", "クローズ"];
const isStopped = (status: string) => STOPPED.includes(status);

export default function DailyClient({
  initialDeals,
  myName,
}: {
  initialDeals: DailyDeal[];
  myName: string;
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [tab, setTab] = useState<"open" | "stopped">("open");
  const owners = useMemo(
    () => Array.from(new Set(initialDeals.map((d) => d.ownerName).filter((n): n is string => Boolean(n)))),
    [initialDeals],
  );
  const [owner, setOwner] = useState(owners.includes(myName) ? myName : "");

  const save = async (id: number, patch: Partial<DailyDeal>) => {
    const before = deals;
    setDeals((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    const res = await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setDeals(before);
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
    }
  };

  const rows = deals.filter(
    (d) => isStopped(d.status) === (tab === "stopped") && (!owner || d.ownerName === owner),
  );
  const openCount = deals.filter((d) => !isStopped(d.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tab label={`募集中 ${openCount}`} active={tab === "open"} onClick={() => setTab("open")} />
        <Tab
          label={`ストップ ${deals.length - openCount}`}
          active={tab === "stopped"}
          onClick={() => setTab("stopped")}
        />
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">全員</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
              <th className="px-4 py-3 text-left font-semibold">案件</th>
              <th className="w-24 px-2 py-3 text-left font-semibold">担当</th>
              {COUNTS.map((c) => (
                <th key={c.key} className="w-24 px-2 py-3 text-center font-semibold">
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-3 text-left font-semibold">メモ</th>
              <th className="w-24 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">
                  <Link href={`/companies/deals/${d.id}`} className="block hover:underline">
                    <span className="font-medium text-[var(--color-text-dark)]">{d.companyName}</span>
                    <span className="block text-xs text-gray-500">{d.title}</span>
                  </Link>
                </td>
                <td className="px-2 py-3 text-gray-600">{d.ownerName ?? "-"}</td>
                {COUNTS.map((c) => (
                  <td key={c.key} className="px-2 py-3">
                    <Counter value={d[c.key]} onChange={(n) => void save(d.id, { [c.key]: n })} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <textarea
                    key={`${d.id}:${d.notes}`}
                    defaultValue={d.notes}
                    rows={Math.min(6, Math.max(1, d.notes.split("\n").length))}
                    onBlur={(e) => {
                      if (e.target.value !== d.notes) void save(d.id, { notes: e.target.value });
                    }}
                    className="w-full resize-y rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-gray-200 focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </td>
                <td className="px-2 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void save(d.id, { status: isStopped(d.status) ? "募集中" : "クローズ" })}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {isStopped(d.status) ? "再開" : "ストップ"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  案件なし
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn = "h-6 w-6 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30";
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button type="button" className={btn} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={`w-5 text-center tabular-nums ${value > 0 ? "font-semibold text-[var(--color-text-dark)]" : "text-gray-300"}`}>
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
