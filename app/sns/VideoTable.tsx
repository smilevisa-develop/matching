"use client";

import { useMemo, useState } from "react";

import { PLATFORMS, type PlatformKey } from "@/lib/sns-platforms";

/** 1 つの動画を、上げた媒体ごとにまとめた行 (同じ動画を全媒体に上げているので、題名でまとめる。page.tsx) */
export type VideoCell = { views: number; likes: number | null; comments: number | null; shares: number | null; url: string | null };
export type VideoRow = { key: string; title: string; titleJa: string; date: string; country: string; cells: Partial<Record<PlatformKey, VideoCell>> };

const METRICS = [
  { key: "views", label: "再生" },
  { key: "likes", label: "いいね" },
  { key: "comments", label: "コメント" },
  { key: "shares", label: "シェア" },
  { key: "rate", label: "反応率" },
] as const;
type Metric = (typeof METRICS)[number]["key"];
type SortKey = "date" | "title" | "total" | PlatformKey;

const SELECT = "rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-[var(--color-text-dark)]";

/** いいね・コメント・シェアの合計 ÷ 再生 */
function rateOf(cells: VideoCell[]) {
  const views = cells.reduce((a, c) => a + c.views, 0);
  const acts = cells.reduce((a, c) => a + (c.likes ?? 0) + (c.comments ?? 0) + (c.shares ?? 0), 0);
  return views > 0 ? acts / views : null;
}
function valueOf(cells: VideoCell[], metric: Metric): number | null {
  if (cells.length === 0) return null;
  if (metric === "rate") return rateOf(cells);
  const xs = cells.map((c) => c[metric]);
  return xs.every((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0);
}
function show(v: number | null, metric: Metric) {
  if (v === null) return "-";
  return metric === "rate" ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("ja-JP");
}

/** key を付けるための入れ物 (中身は th) */
function HeadCell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function VideoTable({ rows, showCountry }: { rows: VideoRow[]; showCountry: boolean }) {
  const [metric, setMetric] = useState<Metric>("views");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "total", desc: true });
  const [platforms, setPlatforms] = useState<PlatformKey[]>(PLATFORMS.map((p) => p.key));
  const [q, setQ] = useState("");

  const cols = PLATFORMS.filter((p) => platforms.includes(p.key));
  const picked = (r: VideoRow) => cols.map((p) => r.cells[p.key]).filter((c): c is VideoCell => !!c);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sortVal = (r: VideoRow): number | string => {
      if (sort.key === "date") return r.date;
      if (sort.key === "title") return (r.titleJa || r.title).toLowerCase();
      if (sort.key === "total") return valueOf(picked(r), metric) ?? -1;
      const c = r.cells[sort.key];
      return c ? (valueOf([c], metric) ?? -1) : -1;
    };
    return rows
      .filter((r) => words.every((w) => `${r.titleJa} ${r.title}`.toLowerCase().includes(w)))
      .filter((r) => picked(r).length > 0)
      .sort((a, b) => {
        const x = sortVal(a);
        const y = sortVal(b);
        const d = x < y ? -1 : x > y ? 1 : 0;
        return sort.desc ? -d : d;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, metric, sort, platforms]);

  const head = (key: SortKey, label: React.ReactNode, right = true) => (
    <th className={`whitespace-nowrap px-3 py-2.5 ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "title" }))}
        className="inline-flex items-center gap-1 font-semibold hover:underline"
      >
        {label}
        <span className="w-3 text-[10px]">{sort.key === key ? (sort.desc ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );

  return (
    <div>
      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-[var(--color-light)] px-4 py-3 text-sm text-[var(--color-text-dark)]">
        <label className="flex items-center gap-2 font-medium">
          数字
          <select className={SELECT} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 font-medium">
          媒体
          {PLATFORMS.map((p) => (
            <label key={p.key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={platforms.includes(p.key)}
                onChange={(e) => setPlatforms((cur) => (e.target.checked ? [...cur, p.key] : cur.filter((k) => k !== p.key)))}
              />
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </label>
          ))}
        </div>
        <input type="search" placeholder="題名で探す" className={`${SELECT} w-48`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm text-[var(--color-text-dark)]">
          <thead>
            <tr className="border-b-2 border-gray-200 text-xs">
              {head("date", "公開日", false)}
              {head("title", "動画", false)}
              {showCountry ? <th className="px-3 py-2.5 text-left font-semibold">国</th> : null}
              {head("total", `合計（${METRICS.find((m) => m.key === metric)!.label}）`)}
              {cols.map((p) => (
                <HeadCell key={p.key}>
                  {head(
                    p.key,
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                      {p.label}
                    </span>,
                  )}
                </HeadCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const total = valueOf(picked(r), metric);
              return (
                <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</td>
                  <td className="min-w-[15rem] px-3 py-2.5">
                    {r.titleJa ? (
                      <>
                        <span className="line-clamp-2 font-medium">{r.titleJa}</span>
                        <span className="mt-0.5 line-clamp-1 text-xs text-gray-600">{r.title}</span>
                      </>
                    ) : (
                      <span className="line-clamp-2 font-medium">{r.title || "(本文なし)"}</span>
                    )}
                  </td>
                  {showCountry ? <td className="whitespace-nowrap px-3 py-2.5">{r.country}</td> : null}
                  <td className="border-r border-gray-200 px-3 py-2.5 text-right text-base font-bold tabular-nums">{show(total, metric)}</td>
                  {cols.map((p) => {
                    const c = r.cells[p.key];
                    const v = c ? valueOf([c], metric) : null;
                    return (
                      <td key={p.key} className="px-3 py-2.5 text-right tabular-nums">
                        {c?.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                            {show(v, metric)}
                          </a>
                        ) : (
                          show(v, metric)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={cols.length + (showCountry ? 4 : 3)} className="px-3 py-4 text-center">
                  当てはまる動画はありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
