"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BOARD_REC_STATUS_EN } from "@/lib/board-labels";

export type BoardListItem = {
  id: number;
  title: string;
  field: string;
  area: string;
  summary: string;
  fee: string;
  monthlyGross: string;
  deadline: string | null;
  updatedAt: string;
  openings: number;
  myCount: number;
  myLimit: number;
  totalCount: number;
  totalLimit: number;
  qaCount: number;
  closed: boolean;
  full: boolean;
  matches: boolean;
};

export type MyRecommendation = {
  id: number;
  candidateName: string;
  status: string;
  statusNote: string;
  createdAt: string;
  updatedAt: string;
  dealId: number;
  dealTitle: string;
};

const fmt = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

export default function BoardListClient({ items, myRecs }: { items: BoardListItem[]; myRecs: MyRecommendation[] }) {
  const [tab, setTab] = useState<"jobs" | "mine">("jobs");
  const [field, setField] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyMatch, setOnlyMatch] = useState(false);

  const fields = useMemo(() => [...new Set(items.map((i) => i.field).filter(Boolean))].sort(), [items]);
  const shown = items.filter(
    (i) => (!field || i.field === field) && (!onlyOpen || (!i.closed && !i.full)) && (!onlyMatch || i.matches),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex gap-2 border-b border-gray-200">
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")}>
          案件 / Jobs <span className="ml-1 text-xs text-gray-500">{items.filter((i) => !i.closed).length}</span>
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          推薦した人 / My candidates <span className="ml-1 text-xs text-gray-500">{myRecs.length}</span>
        </TabButton>
      </div>

      {tab === "jobs" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-gray-600">分野 / Field</span>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1"
              >
                <option value="">すべて / All</option>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              推薦できる案件だけ / Open only
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} />
              貴社の分野に合う案件だけ / Matches your fields
            </label>
            <span className="ml-auto text-gray-600" aria-live="polite">
              {shown.length} 件 / jobs
            </span>
          </div>

          {shown.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
              {items.length === 0 ? (
                <>
                  いま公開中の案件はありません。新しい案件が出たらお知らせします。
                  <br />
                  No jobs are open right now. We will let you know when new jobs are posted.
                </>
              ) : (
                <>
                  この条件に合う案件はありません。条件を外すと {items.length} 件の案件が見られます。
                  <br />
                  No jobs match these filters. Clear the filters to see all {items.length} jobs.
                </>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {shown.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/board/${i.id}`}
                    className="block h-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge item={i} />
                      {i.field ? <Pill>{i.field}</Pill> : null}
                      {i.matches ? <Pill tone="accent">貴社の分野 / Your field</Pill> : null}
                    </div>
                    <h2 className="mt-2 text-base font-bold text-[var(--color-text-dark)]">{i.title}</h2>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      {i.area ? (
                        <>
                          <dt className="text-gray-500">勤務地</dt>
                          <dd>{i.area}</dd>
                        </>
                      ) : null}
                      {i.monthlyGross ? (
                        <>
                          <dt className="text-gray-500">月給</dt>
                          <dd>{i.monthlyGross}</dd>
                        </>
                      ) : null}
                      {i.fee ? (
                        <>
                          <dt className="text-gray-500">紹介料</dt>
                          <dd className="font-semibold text-[var(--color-primary)]">{i.fee}</dd>
                        </>
                      ) : null}
                      <dt className="text-gray-500">推薦枠</dt>
                      <dd>
                        貴社 {i.myCount}/{i.myLimit} ・ 全体 {i.totalCount}/{i.totalLimit}
                      </dd>
                      {i.deadline ? (
                        <>
                          <dt className="text-gray-500">締切</dt>
                          <dd>{fmt(i.deadline)}</dd>
                        </>
                      ) : null}
                    </dl>
                    {i.summary ? <p className="mt-2 line-clamp-2 text-sm text-gray-600">{i.summary}</p> : null}
                    <p className="mt-3 text-xs text-gray-400">
                      更新 {fmt(i.updatedAt)}
                      {i.qaCount ? ` ・ Q&A ${i.qaCount} 件` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          {myRecs.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-600">
              まだ推薦していません。案件ページから推薦できます。
              <br />
              You have not recommended anyone yet.
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">候補者 / Candidate</th>
                  <th className="px-3 py-2">案件 / Job</th>
                  <th className="px-3 py-2">状況 / Status</th>
                  <th className="px-3 py-2">推薦日 / Sent</th>
                </tr>
              </thead>
              <tbody>
                {myRecs.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-medium">{r.candidateName}</td>
                    <td className="px-3 py-2">
                      <Link href={`/board/${r.dealId}`} className="text-[var(--color-primary)] underline">
                        {r.dealTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{r.status}</span>
                      <span className="text-gray-500"> / {BOARD_REC_STATUS_EN[r.status] ?? r.status}</span>
                      {r.statusNote ? <p className="mt-0.5 text-xs text-gray-600">{r.statusNote}</p> : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
        active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "accent" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        tone === "accent" ? "bg-amber-100 text-amber-800" : "bg-[var(--color-light)] text-[var(--color-text-dark)]"
      }`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ item }: { item: { closed: boolean; full: boolean } }) {
  if (item.closed) return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">締切 / Closed</span>;
  if (item.full) return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">満枠 / Full</span>;
  return <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">募集中 / Open</span>;
}
