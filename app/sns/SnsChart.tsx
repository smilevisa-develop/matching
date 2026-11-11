"use client";

import { useState } from "react";

import { PLATFORMS, type PlatformKey } from "@/lib/sns-platforms";

export type ChartItem = { platform: PlatformKey; date: string; views: number; title: string };
export type ChartGroup = { label: string; items: ChartItem[] };

const NARROW = 560;
const WIDE = 1120;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 44, left: 52 };

/** dates = 期間のすべての日 (日本時間の YYYY-MM-DD)。投稿のない日も空けて並べる */
export default function SnsChart({ groups, dates }: { groups: ChartGroup[]; dates: string[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">公開日ごとの再生数（媒体別の積み上げ）</h2>
        <ul className="flex flex-wrap gap-4 text-xs font-medium text-[var(--color-text-dark)]">
          {PLATFORMS.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </li>
          ))}
        </ul>
      </div>
      <div className={`mt-4 grid gap-6 ${groups.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {groups.map((g) => (
          <OneChart key={g.label} group={g} dates={dates} W={groups.length > 1 ? NARROW : WIDE} />
        ))}
      </div>
    </section>
  );
}

type Bar = { date: string; total: number; parts: { platform: PlatformKey; views: number; titles: string[] }[] };

function OneChart({ group, dates, W }: { group: ChartGroup; dates: string[]; W: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const byDate = new Map<string, Bar>(dates.map((d) => [d, { date: d, total: 0, parts: PLATFORMS.map((p) => ({ platform: p.key, views: 0, titles: [] })) }]));
  for (const it of group.items) {
    if (!it.date) continue;
    // 日本時間の日付
    const d = new Date(new Date(it.date).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const bar = byDate.get(d);
    if (!bar) continue;
    const part = bar.parts.find((p) => p.platform === it.platform)!;
    part.views += it.views;
    if (it.title) part.titles.push(it.title);
    bar.total += it.views;
    byDate.set(d, bar);
  }
  const bars = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(1, ...bars.map((b) => b.total));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = bars.length ? plotW / bars.length : plotW;
  const barW = Math.max(4, Math.min(48, slot * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const fmt = (v: number) => v.toLocaleString("ja-JP");
  const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const labelEvery = Math.ceil(bars.length / 10);
  const h = hover === null ? null : bars[hover];

  return (
    <div>
      {group.label ? <h3 className="text-sm font-semibold text-[var(--color-text-dark)]">{group.label}</h3> : null}
      {bars.every((b) => b.total === 0) ? (
        <p className="mt-2 text-sm text-[var(--color-text-dark)]">この期間に公開した動画はありません</p>
      ) : (
        <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${group.label} の公開日ごとの再生数`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E5E7EB" />
                <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#22443A">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {bars.map((b, i) => {
              const x = PAD.left + slot * i + (slot - barW) / 2;
              let acc = 0;
              return (
                <g key={b.date} onMouseEnter={() => setHover(i)}>
                  <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill={hover === i ? "#F1F6F2" : "transparent"} />
                  {b.parts.map((p) => {
                    if (p.views <= 0) return null;
                    const y0 = y(acc + p.views);
                    const hgt = Math.max(0, y(acc) - y0 - 2);
                    acc += p.views;
                    return <rect key={p.platform} x={x} y={y0} width={barW} height={hgt} fill={PLATFORMS.find((q) => q.key === p.platform)!.color} rx="2" />;
                  })}
                  {i % labelEvery === 0 ? (
                    <text x={x + barW / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="#22443A">
                      {dayLabel(b.date)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#9CA3AF" />
          </svg>
          {h ? (
            <div
              className="pointer-events-none absolute top-2 z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs text-[var(--color-text-dark)] shadow-lg"
              style={{ left: `${Math.min(100 - 48, ((PAD.left + slot * (hover! + 0.5)) / W) * 100)}%` }}
            >
              <p className="font-semibold">
                {h.date.replaceAll("-", "/")}　合計 {fmt(h.total)}
              </p>
              <ul className="mt-1 space-y-1">
                {h.parts
                  .filter((p) => p.views > 0 || p.titles.length > 0)
                  .map((p) => {
                    const meta = PLATFORMS.find((q) => q.key === p.platform)!;
                    return (
                      <li key={p.platform}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: meta.color }} />
                            {meta.label}
                          </span>
                          <span className="tabular-nums font-semibold">{fmt(p.views)}</span>
                        </div>
                        {p.titles.slice(0, 2).map((t) => (
                          <p key={t} className="truncate pl-4 text-[11px]">
                            {t}
                          </p>
                        ))}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
