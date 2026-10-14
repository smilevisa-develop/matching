"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { CANDIDATE_STAGES, dealGroup } from "@/lib/deal-stages";

export type DailyDeal = {
  id: number;
  status: string;
  requiredCount: number;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  companyExternalId: string | null;
  companyName: string;
  ownerName: string | null;
  candidates: { id: number; stage: string; personId: number; name: string }[];
};

type CountKey = "requiredCount" | "recommendedCount" | "interviewCount" | "offerCount";

const COUNTS: { key: CountKey; label: string }[] = [
  { key: "requiredCount", label: "募集人数" },
  { key: "recommendedCount", label: "推薦" },
  { key: "interviewCount", label: "面接" },
  { key: "offerCount", label: "内定" },
];

export default function DailyClient({
  deals,
  myName,
  offerTarget,
}: {
  deals: DailyDeal[];
  myName: string;
  offerTarget: number | null;
}) {
  const [tab, setTab] = useState<"open" | "stopped">("open");
  const owners = Array.from(new Set(deals.map((d) => d.ownerName).filter((n): n is string => Boolean(n))));
  const [owner, setOwner] = useState(owners.includes(myName) ? myName : "");
  const [openId, setOpenId] = useState<number | null>(null);

  const mine = deals.filter((d) => !owner || d.ownerName === owner);
  const urgent = mine.filter((d) => dealGroup(d.status) === "urgent");
  const open = mine.filter((d) => dealGroup(d.status) === "open");
  const stopped = mine.filter((d) => dealGroup(d.status) === "stopped");
  const active = [...urgent, ...open];
  const sum = (key: CountKey) => active.reduce((n, d) => n + d[key], 0);

  const island = (title: string, rows: DailyDeal[]) => (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <DealTable rows={rows} openId={openId} onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))} />
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="内定目標" value={offerTarget ?? "-"} />
        <Kpi label="内定" value={sum("offerCount")} />
        <Kpi label="面接" value={sum("interviewCount")} />
        <Kpi label="推薦" value={sum("recommendedCount")} />
        <Kpi label="募集人数" value={sum("requiredCount")} />
        <Kpi label="募集中の企業" value={active.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tab label="募集中" active={tab === "open"} onClick={() => setTab("open")} />
        <Tab label="ストップ" active={tab === "stopped"} onClick={() => setTab("stopped")} />
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

      {tab === "open" ? (
        <>
          {island("急ぎ募集", urgent)}
          {island("募集中", open)}
        </>
      ) : (
        <DealTable rows={stopped} openId={openId} onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))} />
      )}
    </div>
  );
}

function DealTable({
  rows,
  openId,
  onToggle,
}: {
  rows: DailyDeal[];
  openId: number | null;
  onToggle: (id: number) => void;
}) {
  return (
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
            <Fragment key={d.id}>
              <tr
                onClick={() => onToggle(d.id)}
                className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${
                  openId === d.id ? "bg-gray-50" : ""
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
                    href={`/companies/deals/${d.id}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${d.companyName} の詳細を開く`}
                    className="block px-3 py-3 text-lg leading-none text-gray-400 hover:text-[var(--color-primary)]"
                  >
                    →
                  </Link>
                </td>
              </tr>
              {openId === d.id ? (
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td colSpan={COUNTS.length + 4} className="px-4 py-3">
                    <CandidateProgress candidates={d.candidates} />
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
  );
}

/** 候補者の進捗表。列は企業詳細のカンバンと同じ */
function CandidateProgress({ candidates }: { candidates: DailyDeal["candidates"] }) {
  if (candidates.length === 0) return <p className="py-2 text-center text-xs text-gray-400">候補者なし</p>;
  return (
    <div className="grid grid-cols-7 gap-2">
      {CANDIDATE_STAGES.map((stage) => {
        const list = candidates.filter((c) => c.stage === stage);
        return (
          <div key={stage} className="min-w-0 rounded-lg border border-gray-200 bg-white p-2">
            <p className="text-[11px] font-semibold text-gray-500">{stage}</p>
            <div className="mt-1 space-y-1">
              {list.map((c) => (
                <Link
                  key={c.id}
                  href={`/personnel/${c.personId}/edit`}
                  className="block truncate text-xs text-[var(--color-text-dark)] hover:underline"
                >
                  {String(c.personId).padStart(3, "0")} {c.name}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-dark)]">{value}</p>
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
