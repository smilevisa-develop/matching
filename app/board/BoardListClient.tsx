"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { bt, recStatusLabel, type BoardLang } from "@/lib/board-i18n";

export type BoardListItem = {
  id: number;
  title: string;
  field: string;
  /** 分野の表示 (選んだ言語) */
  fieldLabel: string;
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

export default function BoardListClient({
  lang,
  items,
  myRecs,
  translating,
}: {
  lang: BoardLang;
  items: BoardListItem[];
  myRecs: MyRecommendation[];
  translating: boolean;
}) {
  const [tab, setTab] = useState<"jobs" | "mine">("jobs");
  const [field, setField] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyMatch, setOnlyMatch] = useState(false);

  const fields = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.field) m.set(i.field, i.fieldLabel || i.field);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const shown = items.filter(
    (i) => (!field || i.field === field) && (!onlyOpen || (!i.closed && !i.full)) && (!onlyMatch || i.matches),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex gap-2 border-b border-gray-200">
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")}>
          {bt(lang, "tabJobs")} <span className="ml-1 text-xs text-gray-500">{items.filter((i) => !i.closed).length}</span>
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          {bt(lang, "tabMine")} <span className="ml-1 text-xs text-gray-500">{myRecs.length}</span>
        </TabButton>
      </div>

      {lang !== "ja" ? (
        <p className="mt-3 text-xs text-gray-600">
          {bt(lang, "translatedNote")}
          {translating ? ` ${bt(lang, "translating")}` : ""}
        </p>
      ) : null}

      {tab === "jobs" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-gray-600">{bt(lang, "field")}</span>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1"
              >
                <option value="">{bt(lang, "all")}</option>
                {fields.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              {bt(lang, "openOnly")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} />
              {bt(lang, "matchOnly")}
            </label>
            <span className="ml-auto text-gray-600" aria-live="polite">
              {bt(lang, "countJobs", { n: shown.length })}
            </span>
          </div>

          {shown.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
              {items.length === 0 ? (
                bt(lang, "emptyNone")
              ) : (
                bt(lang, "emptyFiltered", { n: items.length })
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
                      <StatusBadge lang={lang} item={i} />
                      {i.fieldLabel ? <Pill>{i.fieldLabel}</Pill> : null}
                      {i.matches ? <Pill tone="accent">{bt(lang, "yourField")}</Pill> : null}
                    </div>
                    <h2 className="mt-2 text-base font-bold text-[var(--color-text-dark)]">{i.title}</h2>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      {i.area ? (
                        <>
                          <dt className="text-gray-500">{bt(lang, "area")}</dt>
                          <dd>{i.area}</dd>
                        </>
                      ) : null}
                      {i.monthlyGross ? (
                        <>
                          <dt className="text-gray-500">{bt(lang, "monthly")}</dt>
                          <dd>{i.monthlyGross}</dd>
                        </>
                      ) : null}
                      {i.fee ? (
                        <>
                          <dt className="text-gray-500">{bt(lang, "fee")}</dt>
                          <dd className="font-semibold text-[var(--color-primary)]">{i.fee}</dd>
                        </>
                      ) : null}
                      <dt className="text-gray-500">{bt(lang, "slots")}</dt>
                      <dd>{bt(lang, "slotsValue", { a: i.myCount, b: i.myLimit, c: i.totalCount, d: i.totalLimit })}</dd>
                      {i.deadline ? (
                        <>
                          <dt className="text-gray-500">{bt(lang, "deadline")}</dt>
                          <dd>{fmt(i.deadline)}</dd>
                        </>
                      ) : null}
                    </dl>
                    {i.summary ? <p className="mt-2 line-clamp-2 text-sm text-gray-600">{i.summary}</p> : null}
                    <p className="mt-3 text-xs text-gray-400">
                      {bt(lang, "updated")} {fmt(i.updatedAt)}
                      {i.qaCount ? ` ・ ${bt(lang, "qaCount", { n: i.qaCount })}` : ""}
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
              {bt(lang, "noRecs")}
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">{bt(lang, "thCandidate")}</th>
                  <th className="px-3 py-2">{bt(lang, "thJob")}</th>
                  <th className="px-3 py-2">{bt(lang, "thStatus")}</th>
                  <th className="px-3 py-2">{bt(lang, "thSent")}</th>
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
                      <span className="font-semibold">{recStatusLabel(lang, r.status)}</span>
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

export function StatusBadge({ lang, item }: { lang: BoardLang; item: { closed: boolean; full: boolean } }) {
  if (item.closed) return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{bt(lang, "badgeClosed")}</span>;
  if (item.full) return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{bt(lang, "badgeFull")}</span>;
  return <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">{bt(lang, "badgeOpen")}</span>;
}
