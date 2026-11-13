"use client";

import { useState } from "react";

/**
 * 企業向けの推薦リストの表 (Airtable のような表。2026/11 土田さん)。
 * 進捗・面接時間・備考は企業がこの画面で直せる。直すとすぐ保存し、アプリ (カンバン) に反映される。
 */

export type ShareCell = { text: string; href?: string };
export type ShareRow = { id: number; personId: string; stage: string; interviewTime: string; companyNote: string; cells: ShareCell[] };

const FONT = { fontFamily: "'Hiragino Sans', 'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif" };

// 進捗の色 (薄い地に濃い字。文字は濃く見やすく)
const STAGE_STYLE: Record<string, string> = {
  接続済み: "bg-sky-100 text-sky-900",
  事前面談済み: "bg-indigo-100 text-indigo-900",
  推薦済み: "bg-amber-100 text-amber-900",
  面接済み: "bg-cyan-100 text-cyan-900",
  内定済み: "bg-emerald-100 text-emerald-900",
  内定承諾: "bg-emerald-200 text-emerald-950",
  入社待ち: "bg-teal-100 text-teal-900",
  入社済み: "bg-teal-200 text-teal-950",
  不合格: "bg-red-100 text-red-900",
  選考NG: "bg-orange-100 text-orange-900",
  応募辞退: "bg-stone-200 text-stone-900",
  内定辞退: "bg-gray-200 text-gray-900",
};

type Saving = Record<string, "saving" | "saved" | "error">;

export default function ShareListTable(props: {
  token: string;
  companyName: string;
  dealTitle: string;
  updated: string;
  header: string[];
  rows: ShareRow[];
  stageOptions: string[];
}) {
  const [rows, setRows] = useState(props.rows);
  const [status, setStatus] = useState<Saving>({});
  const [toast, setToast] = useState<string | null>(null);

  const save = async (row: ShareRow, field: "stage" | "interviewTime" | "companyNote", value: string) => {
    const key = `${row.id}:${field}`;
    setStatus((s) => ({ ...s, [key]: "saving" }));
    try {
      const res = await fetch(`/api/list/${props.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: row.id, [field]: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "保存できませんでした");
      setRows((rs) =>
        rs.map((r) =>
          r.id === row.id
            ? { ...r, stage: json.candidate.stage ?? r.stage, interviewTime: json.candidate.interviewTime ?? "", companyNote: json.candidate.companyNote ?? "" }
            : r,
        ),
      );
      setStatus((s) => ({ ...s, [key]: "saved" }));
      setToast("保存しました");
    } catch (e) {
      setStatus((s) => ({ ...s, [key]: "error" }));
      setToast(e instanceof Error ? e.message : "保存できませんでした");
    }
    setTimeout(() => setToast(null), 2000);
  };

  const th = "sticky top-0 z-20 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2.5 text-left text-[13px] font-bold text-gray-800";
  const td = "border-b border-r border-gray-200 px-3 py-2 align-middle";
  const editTh = (label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden className="text-[var(--color-primary)]">
        <path d="M11.5 1.5l3 3L5 14H2v-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F6F7] text-gray-900" style={FONT}>
      <header className="border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-[var(--color-text-dark)] sm:text-xl">{props.companyName} 様　推薦リスト</h1>
            <p className="truncate text-sm font-medium text-gray-700">{props.dealTitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm font-medium text-gray-700">
            <span className="rounded-full bg-[var(--color-light)] px-3 py-1 font-bold text-[var(--color-primary)]">{rows.length} 名</span>
            <span>{props.updated} 時点</span>
          </div>
        </div>
        <p className="border-t border-gray-100 bg-[var(--color-light)] px-4 py-2 text-sm font-medium text-[var(--color-text-dark)] sm:px-6">
          鉛筆マークの列（進捗・面接時間・備考）は、この画面で入力できます。入力するとすぐ保存され、担当者に届きます。
        </p>
      </header>

      <main className="flex-1 p-3 sm:p-5">
        <div className="max-h-[calc(100vh-150px)] overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-30 w-10 text-center`}>#</th>
                <th className={th}>ID</th>
                <th className={`${th} min-w-[150px]`}>{editTh("進捗")}</th>
                {props.header.map((h, i) => (
                  <th key={i} className={`${th} min-w-[110px]`}>
                    {h}
                  </th>
                ))}
                <th className={`${th} min-w-[210px]`}>{editTh("面接時間")}</th>
                <th className={`${th} min-w-[240px]`}>{editTh("備考")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.id} className="group">
                  <td className={`${td} sticky left-0 z-10 bg-white text-center text-xs font-semibold text-gray-600 group-hover:bg-gray-50`}>{ri + 1}</td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums text-gray-800 group-hover:bg-gray-50`}>{r.personId}</td>
                  <td className={`${td} group-hover:bg-gray-50`}>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={r.stage}
                        onChange={(e) => void save(r, "stage", e.target.value)}
                        aria-label="進捗"
                        className={`cursor-pointer appearance-none rounded-full border-0 py-1 pl-3 pr-7 text-[13px] font-bold outline-none ring-[var(--color-primary)] focus:ring-2 ${STAGE_STYLE[r.stage] ?? "bg-gray-100 text-gray-900"}`}
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%23333' stroke-width='1.5'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
                      >
                        {props.stageOptions.includes(r.stage) ? null : <option value={r.stage}>{r.stage || "-"}</option>}
                        {props.stageOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <Mark state={status[`${r.id}:stage`]} />
                    </div>
                  </td>
                  {r.cells.map((c, ci) => (
                    <td key={ci} title={c.text || undefined} className={`${td} max-w-[260px] truncate text-gray-900 group-hover:bg-gray-50`}>
                      {c.href ? (
                        <a href={c.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
                          {c.text}
                        </a>
                      ) : (
                        c.text
                      )}
                    </td>
                  ))}
                  <td className={`${td} group-hover:bg-gray-50`}>
                    <EditCell value={r.interviewTime} placeholder="例: 11/20 14:00" state={status[`${r.id}:interviewTime`]} onSave={(v) => void save(r, "interviewTime", v)} />
                  </td>
                  <td className={`${td} group-hover:bg-gray-50`}>
                    <EditCell value={r.companyNote} placeholder="メモを入力" state={status[`${r.id}:companyNote`]} onSave={(v) => void save(r, "companyNote", v)} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={props.header.length + 5} className="px-4 py-10 text-center font-medium text-gray-700">
                    まだ候補者はいません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-gray-600">SMILE MATCHING</p>
      </main>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-5 py-2 text-sm font-bold text-white shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}

function Mark({ state }: { state?: "saving" | "saved" | "error" }) {
  if (state === "saving") return <span className="text-xs font-medium text-gray-600">保存中…</span>;
  if (state === "error") return <span className="text-xs font-bold text-red-700">保存できませんでした</span>;
  return null;
}

/** 表のセルのまま書ける入力欄。離れたとき (または Enter) に、変わっていれば保存する */
function EditCell({ value, placeholder, state, onSave }: { value: string; placeholder: string; state?: "saving" | "saved" | "error"; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(value);
  if (value !== base) {
    setBase(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        maxLength={500}
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 outline-none placeholder:text-gray-600 hover:border-gray-300 focus:border-[var(--color-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--color-light)]"
      />
      <Mark state={state} />
    </div>
  );
}
