"use client";

/**
 * 企業向けの推薦リストの表 (Airtable のような表。2026/11 土田さん)。
 * 中身はアプリのカンバン・候補者の情報から、開くたびに作る (アプリを直せば自動で変わる)。
 * 右上の鉛筆 → 暗証番号で編集できる。編集できる状態はこの画面の中だけで、ページを閉じれば終わる (「編集を終える」でも戻せる)。
 * 備考は一番右の列 (2026-11-18 土田さん)。
 */

import { useState } from "react";

export type ShareCell = { key: string; text: string; href?: string; base?: string; edited?: boolean };
export type ShareRow = { id: number; personId: string; stage: string; interviewTime: string; note: string; cells: ShareCell[] };

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

type Editing = { rowId: number; key: string; value: string } | null;

export default function ShareListTable(props: { companyName: string; dealTitle: string; updated: string; token: string; header: string[]; rows: ShareRow[] }) {
  const [rows, setRows] = useState(props.rows);
  const [pass, setPass] = useState<string | null>(null); // 編集中なら暗証番号 (画面の中だけ)
  const [asking, setAsking] = useState(false);
  const [input, setInput] = useState("");
  const [askError, setAskError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);

  const th = "sticky top-0 z-20 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2.5 text-left text-[13px] font-bold text-gray-800";
  const td = "border-b border-r border-gray-200 px-3 py-2.5 align-middle group-hover:bg-gray-50";
  const editable = pass !== null;

  const unlock = async () => {
    setAskError("");
    const res = await fetch(`/api/list/${props.token}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass: input }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setAskError(data.error ?? "確認できませんでした");
      return;
    }
    setPass(input);
    setAsking(false);
    setInput("");
  };

  const save = async () => {
    if (!editing || pass === null) return;
    const { rowId, key, value } = editing;
    setSaving(true);
    try {
      const res = await fetch(`/api/list/${props.token}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass, id: rowId, key, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "保存できませんでした");
        return;
      }
      const v = value.trim();
      setRows((cur) =>
        cur.map((r) => {
          if (r.id !== rowId) return r;
          if (key === "interviewTime") return { ...r, interviewTime: v };
          if (key === "note") return { ...r, note: v };
          return { ...r, cells: r.cells.map((c) => (c.key === key ? { ...c, text: v, edited: true } : c)) };
        }),
      );
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  /** 編集できるセル: 編集中は押すと入力欄になる */
  const cell = (r: ShareRow, key: string, text: string, opts: { wide?: boolean; bold?: boolean; edited?: boolean }) => {
    const isEditing = editing?.rowId === r.id && editing.key === key;
    const base = `${td} ${opts.wide ? "max-w-[320px]" : "max-w-[260px]"} ${opts.bold ? "font-medium" : ""} text-gray-900`;
    if (isEditing) {
      return (
        <td key={key} className={`${td} bg-yellow-50 p-1`}>
          <textarea
            autoFocus
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void save();
              }
              if (e.key === "Escape") setEditing(null);
            }}
            rows={2}
            className="w-full min-w-[180px] rounded border-2 border-[var(--color-primary)] px-2 py-1 text-sm text-gray-900 outline-none"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button type="button" onClick={() => setEditing(null)} className="rounded px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              やめる
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-[var(--color-primary)] px-2 py-0.5 text-xs font-bold text-white disabled:opacity-60">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </td>
      );
    }
    if (editable) {
      return (
        <td
          key={key}
          title={text || undefined}
          onClick={() => setEditing({ rowId: r.id, key, value: text })}
          className={`${base} cursor-text truncate hover:bg-yellow-50 ${opts.edited ? "bg-yellow-50/60" : ""}`}
        >
          {text || <span className="text-gray-400">＋</span>}
        </td>
      );
    }
    return (
      <td key={key} title={text || undefined} className={`${base} truncate`}>
        {text}
      </td>
    );
  };

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
            {editable ? (
              <button
                type="button"
                onClick={() => {
                  setPass(null);
                  setEditing(null);
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-600"
              >
                編集を終える
              </button>
            ) : (
              <button
                type="button"
                title="編集する"
                aria-label="編集する"
                onClick={() => {
                  setAsking(true);
                  setAskError("");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {editable ? (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 sm:px-6">
            編集中です。セルを押すと直せます。ページを閉じると編集できなくなります。
          </div>
        ) : null}
      </header>

      <main className="flex-1 p-3 sm:p-5">
        <div className="max-h-[calc(100vh-120px)] overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-30 w-10 text-center`}>#</th>
                <th className={th}>ID</th>
                <th className={`${th} min-w-[120px]`}>進捗</th>
                <th className={`${th} min-w-[160px]`}>面接可能な時間帯</th>
                {props.header.map((h, i) => (
                  <th key={i} className={`${th} min-w-[110px]`}>
                    {h}
                  </th>
                ))}
                <th className={`${th} min-w-[180px]`}>備考</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.id} className="group">
                  <td className={`${td} sticky left-0 z-10 bg-white text-center text-xs font-semibold text-gray-600`}>{ri + 1}</td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums text-gray-800`}>{r.personId}</td>
                  <td className={td}>
                    {r.stage ? (
                      <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold ${STAGE_STYLE[r.stage] ?? "bg-gray-100 text-gray-900"}`}>{r.stage}</span>
                    ) : null}
                  </td>
                  {cell(r, "interviewTime", r.interviewTime, { bold: true })}
                  {r.cells.map((c) =>
                    c.href ? (
                      <td key={c.key} title={c.text || undefined} className={`${td} max-w-[260px] truncate text-gray-900`}>
                        <a href={c.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
                          {c.text}
                        </a>
                      </td>
                    ) : (
                      cell(r, c.key, c.text, { edited: c.edited })
                    ),
                  )}
                  {cell(r, "note", r.note, { wide: true })}
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

      {asking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAsking(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl"
          >
            <p className="text-base font-bold text-gray-900">暗証番号</p>
            <input
              autoFocus
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-[var(--color-primary)]"
            />
            {askError ? <p className="mt-2 text-sm font-semibold text-red-700">{askError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                やめる
              </button>
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
                編集する
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
