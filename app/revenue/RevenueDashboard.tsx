"use client";

/**
 * 売上ダッシュボード v2
 * - 上部: 月選択 (type=month). 既定は当月、開始は 2026-03 から
 * - KPI: 当月の 求人数 / 推薦者数 / 内定 / 売上 をタコメーター
 * - 年間推移グラフ: 求人数 / 推薦者数 / 内定 / 売上 を target vs actual 棒+線
 * - 年間目標テーブル: 月ごとに 4 メトリクス目標を直接編集 (PATCH /api/settings)
 *
 * 実績の集計:
 *   求人数 (jobOpenings) = その月に作成 (createdAt) または受注 (acceptedAt) された Deal の件数
 *   推薦者数 (recommendCount) = その月に invoice の channel に関わらず deal が紐づいた "ユニーク企業数" を概算
 *   内定者数 (offerCount) = その月に紐づく Deal の offerCount 合計
 *   売上 (revenue) = その月の invoice.invoiceAmount の合計
 */

import { Fragment, useEffect, useMemo, useState } from "react";

type DealRow = {
  id: number;
  title: string;
  companyName: string;
  acceptedAt: string | null;
  createdAt: string;
  requiredCount: number;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  contractCount: number;
};

type InvoiceRow = {
  id: number;
  invoiceDate: string | null;
  createdAt: string;
  invoiceAmount: string | null;
  costAmount: string | null;
  channel: string;
  invoiceStatus: string;
  dealTitle: string | null;
  companyName: string | null;
  personName: string | null;
};

export type MonthlyTargetEntry = {
  month: string; // YYYY-MM
  offer: number | null;
  revenue: number | null;
  jobOpenings: number | null;
  recommendCount: number | null;
};

function parseNumber(value: string | null): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, "");
  return Number(cleaned) || 0;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const FISCAL_START_MONTH = "2026-03"; // 表示開始月

export default function RevenueDashboard({
  initialDeals,
  initialInvoices,
  monthlyTargets: initialMonthlyTargets,
}: {
  initialDeals: DealRow[];
  initialInvoices: InvoiceRow[];
  monthlyOfferTarget: number | null;
  monthlyRevenueTarget: number | null;
  monthlyTargets: MonthlyTargetEntry[];
}) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKey(now));
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyTargetEntry[]>(initialMonthlyTargets);

  // 表示する月リスト (FISCAL_START_MONTH から最新月+残り12 か月分まで or 全部 monthlyTargets 入っている月)
  const yearMonths = useMemo(() => buildYearMonths(FISCAL_START_MONTH, monthlyTargets), [monthlyTargets]);

  // 月別実績集計 (求人数, 推薦者数, 内定, 売上)
  const actualsByMonth = useMemo(() => {
    return aggregateActuals(initialDeals, initialInvoices, yearMonths);
  }, [initialDeals, initialInvoices, yearMonths]);

  // 当月の目標と実績
  const currentTarget = monthlyTargets.find((t) => t.month === selectedMonth) ?? null;
  const currentActual = actualsByMonth[selectedMonth] ?? {
    jobOpenings: 0,
    recommendCount: 0,
    offer: 0,
    revenue: 0,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">売上ダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-500">月を選んで目標達成率を確認、下の表から月ごとの目標を編集できます。</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          月:
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            min={FISCAL_START_MONTH}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </label>
      </header>

      {/* 当月のメトリクス: 案件ファネル (左) + 内定 / 売上 タコメーター (右) */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text-dark)]">案件ファネル</h2>
            <p className="text-xs text-gray-500">募集 → 推薦 → 面接 → 内定</p>
          </div>
          <Funnel
            stages={[
              { label: "募集", value: sumDealField(initialDeals, "requiredCount"), color: "#DCE8DF" },
              { label: "推薦", value: sumDealField(initialDeals, "recommendedCount"), color: "#B5CEC3" },
              { label: "面接", value: sumDealField(initialDeals, "interviewCount"), color: "#7EAE97" },
              { label: "内定", value: sumDealField(initialDeals, "offerCount"), color: "#2E5E4E" },
            ]}
          />
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-[var(--color-light)] px-3 py-2">
              <p className="text-gray-500">推薦 → 内定 転換率</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text-dark)]">
                {ratioPercent(
                  sumDealField(initialDeals, "offerCount"),
                  sumDealField(initialDeals, "recommendedCount")
                )}%
              </p>
            </div>
            <div className="rounded-xl bg-[var(--color-light)] px-3 py-2">
              <p className="text-gray-500">面接 → 内定 転換率</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text-dark)]">
                {ratioPercent(
                  sumDealField(initialDeals, "offerCount"),
                  sumDealField(initialDeals, "interviewCount")
                )}%
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{selectedMonth} 達成率</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Tachometer label="内定者数" unit="件" value={currentActual.offer} target={currentTarget?.offer ?? null} />
            <Tachometer
              label="売上"
              unit="円"
              value={currentActual.revenue}
              target={currentTarget?.revenue ?? null}
              format={(n) => n.toLocaleString()}
            />
          </div>
        </div>
      </section>

      {/* 年間推移グラフ (4 メトリクス) */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">年間推移 (目標 vs 実績)</h2>
          <p className="text-xs text-gray-500">{yearMonths[0]} 〜 {yearMonths[yearMonths.length - 1]}</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <BarLineChart
            title="求人数"
            yearMonths={yearMonths}
            actuals={yearMonths.map((m) => actualsByMonth[m]?.jobOpenings ?? 0)}
            targets={yearMonths.map((m) => monthlyTargets.find((t) => t.month === m)?.jobOpenings ?? null)}
          />
          <BarLineChart
            title="推薦者数"
            yearMonths={yearMonths}
            actuals={yearMonths.map((m) => actualsByMonth[m]?.recommendCount ?? 0)}
            targets={yearMonths.map((m) => monthlyTargets.find((t) => t.month === m)?.recommendCount ?? null)}
          />
          <BarLineChart
            title="内定者数"
            yearMonths={yearMonths}
            actuals={yearMonths.map((m) => actualsByMonth[m]?.offer ?? 0)}
            targets={yearMonths.map((m) => monthlyTargets.find((t) => t.month === m)?.offer ?? null)}
          />
          <BarLineChart
            title="売上"
            yearMonths={yearMonths}
            actuals={yearMonths.map((m) => actualsByMonth[m]?.revenue ?? 0)}
            targets={yearMonths.map((m) => monthlyTargets.find((t) => t.month === m)?.revenue ?? null)}
            yenFormat
          />
        </div>
      </section>

      {/* 年間目標テーブル (編集可) */}
      <MonthlyTargetTable
        yearMonths={yearMonths}
        targets={monthlyTargets}
        actualsByMonth={actualsByMonth}
        onChange={setMonthlyTargets}
      />
    </div>
  );
}

/* ---------- helpers ---------- */

function sumDealField(deals: DealRow[], key: "requiredCount" | "recommendedCount" | "interviewCount" | "offerCount" | "contractCount"): number {
  return deals.reduce((sum, d) => sum + (d[key] ?? 0), 0);
}

function buildYearMonths(startMonthKey: string, targets: MonthlyTargetEntry[]): string[] {
  // 開始月 (2026-03) から、targets の最大月 or 当月 + 12 ヶ月までの一覧
  const [sy, sm] = startMonthKey.split("-").map((v) => parseInt(v, 10));
  const start = new Date(sy, sm - 1, 1);
  const today = new Date();
  const targetMaxKey = targets.length > 0 ? targets[targets.length - 1].month : startMonthKey;
  const [tmy, tmm] = targetMaxKey.split("-").map((v) => parseInt(v, 10));
  const candidate = new Date(tmy, tmm - 1, 1);
  // 当月 + 11 ヶ月先までは少なくとも見せる
  const today11 = new Date(today.getFullYear(), today.getMonth() + 11, 1);
  const end = candidate.getTime() > today11.getTime() ? candidate : today11;
  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function aggregateActuals(
  deals: DealRow[],
  invoices: InvoiceRow[],
  yearMonths: string[]
): Record<string, { jobOpenings: number; recommendCount: number; offer: number; revenue: number }> {
  const result: Record<string, { jobOpenings: number; recommendCount: number; offer: number; revenue: number }> = {};
  for (const m of yearMonths) result[m] = { jobOpenings: 0, recommendCount: 0, offer: 0, revenue: 0 };

  // 求人数: deal の acceptedAt (or createdAt) が当月にあるものをカウント
  // 推薦者数: その月に created/accepted された deal の uniq companyName 数
  const dealsByMonthCompanies = new Map<string, Set<string>>();
  for (const d of deals) {
    const ref = d.acceptedAt ?? d.createdAt;
    if (!ref) continue;
    const key = monthKey(new Date(ref));
    if (!result[key]) continue;
    result[key].jobOpenings += 1;
    result[key].offer += d.offerCount ?? 0;
    if (!dealsByMonthCompanies.has(key)) dealsByMonthCompanies.set(key, new Set());
    if (d.companyName) dealsByMonthCompanies.get(key)!.add(d.companyName);
  }
  for (const [m, set] of dealsByMonthCompanies) {
    if (result[m]) result[m].recommendCount = set.size;
  }

  // 売上: invoice.invoiceDate (or createdAt) が当月の invoice 合計
  for (const inv of invoices) {
    const ref = inv.invoiceDate ?? inv.createdAt;
    if (!ref) continue;
    const key = monthKey(new Date(ref));
    if (!result[key]) continue;
    result[key].revenue += parseNumber(inv.invoiceAmount);
  }
  return result;
}

/* ---------- Tachometer ---------- */

function Tachometer({
  label,
  unit,
  value,
  target,
  format,
}: {
  label: string;
  unit: string;
  value: number;
  target: number | null;
  format?: (n: number) => string;
}) {
  const fmt = format ?? ((n: number) => String(n));
  const ratio = target && target > 0 ? Math.min(value / target, 1) : 0;
  const percent = target && target > 0 ? Math.round((value / target) * 100) : null;

  const radius = 70;
  const cx = 90;
  const cy = 90;
  const strokeWidth = 16;
  const startAngle = Math.PI;
  const endAngle = 0;
  const angle = startAngle + (endAngle - startAngle) * ratio;
  const polar = (a: number) => ({ x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) });
  const start = polar(startAngle);
  const end = polar(angle);
  const fullEnd = polar(endAngle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const arcPath = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  const fullArcPath = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${fullEnd.x.toFixed(2)} ${fullEnd.y.toFixed(2)}`;
  const needleLength = radius - 6;
  const needleEnd = { x: cx + needleLength * Math.cos(angle), y: cy - needleLength * Math.sin(angle) };
  const fillColor =
    percent === null ? "#9CA3AF" : percent >= 100 ? "#16A34A" : percent >= 70 ? "#2E5E4E" : percent >= 40 ? "#F59E0B" : "#DC2626";

  return (
    <div className="rounded-xl border border-gray-200 bg-[var(--color-light)] p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">{label}</p>
        <p className="text-xs text-gray-500">単位: {unit}</p>
      </div>
      <svg viewBox="0 0 180 110" className="mt-2 w-full">
        <path d={fullArcPath} fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} strokeLinecap="round" />
        {ratio > 0 ? <path d={arcPath} fill="none" stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round" /> : null}
        <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke={fillColor} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill={fillColor} />
        <text x={cx} y={cy - 14} textAnchor="middle" className="fill-[var(--color-text-dark)]" style={{ fontSize: "22px", fontWeight: 700 }}>
          {percent !== null ? `${percent}%` : "—"}
        </text>
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>
          実績 <span className="text-sm font-bold text-[var(--color-text-dark)]">{fmt(value)}</span> {unit}
        </span>
        <span className="text-gray-500">目標 {target != null ? `${fmt(target)} ${unit}` : "未設定"}</span>
      </div>
    </div>
  );
}

/* ---------- Funnel (inverted-triangle / horizontal bars) ---------- */

function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="mt-4 space-y-3">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{stage.label}</span>
            <span>{stage.value}名</span>
          </div>
          <div className="mt-1 h-5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(stage.value / max) * 100}%`, background: stage.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ratioPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0";
  return ((numerator / denominator) * 100).toFixed(1);
}

/* ---------- Bar + Line chart (target as line, actual as bar) ---------- */

function BarLineChart({
  title,
  yearMonths,
  actuals,
  targets,
  yenFormat = false,
}: {
  title: string;
  yearMonths: string[];
  actuals: number[];
  targets: (number | null)[];
  yenFormat?: boolean;
}) {
  const width = Math.max(360, yearMonths.length * 40);
  const height = 220;
  const padding = { top: 10, right: 10, bottom: 36, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...actuals, ...targets.map((t) => t ?? 0));
  const x = (i: number) => padding.left + (i + 0.5) * (innerW / yearMonths.length);
  const y = (v: number) => padding.top + innerH - (v / max) * innerH;
  const barWidth = Math.max(8, innerW / yearMonths.length - 8);

  const fmt = (n: number) => (yenFormat ? `${(n / 1000).toFixed(0)}k` : String(n));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold text-[var(--color-text-dark)]">{title}</p>
      <div className="mt-2 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
          {/* y 軸目盛 */}
          {[0, 0.5, 1].map((r, i) => (
            <g key={i}>
              <line x1={padding.left} y1={padding.top + innerH * (1 - r)} x2={padding.left + innerW} y2={padding.top + innerH * (1 - r)} stroke="#E5E7EB" strokeWidth={1} />
              <text x={padding.left - 4} y={padding.top + innerH * (1 - r) + 4} textAnchor="end" fontSize={10} fill="#9CA3AF">
                {fmt(max * r)}
              </text>
            </g>
          ))}
          {/* x 軸ラベル (3 ヶ月ごと) */}
          {yearMonths.map((m, i) =>
            i % 3 === 0 ? (
              <text key={m} x={x(i)} y={height - 10} textAnchor="middle" fontSize={10} fill="#6B7280">
                {m.slice(2)}
              </text>
            ) : null
          )}
          {/* 棒 (実績) */}
          {actuals.map((a, i) => {
            const top = y(a);
            const h = padding.top + innerH - top;
            return <rect key={i} x={x(i) - barWidth / 2} y={top} width={barWidth} height={h} fill="#2E5E4E" rx={2} />;
          })}
          {/* 線 (目標) */}
          <polyline
            fill="none"
            stroke="#C89F5B"
            strokeWidth={2}
            strokeDasharray="4 3"
            points={targets
              .map((t, i) => (t != null ? `${x(i)},${y(t)}` : null))
              .filter((p): p is string => !!p)
              .join(" ")}
          />
          {targets.map((t, i) =>
            t != null ? <circle key={i} cx={x(i)} cy={y(t)} r={3} fill="#C89F5B" /> : null
          )}
        </svg>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "#2E5E4E" }} />
          実績
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3" style={{ background: "#C89F5B" }} />
          目標
        </span>
      </div>
    </div>
  );
}

/* ---------- Editable monthly target table ---------- */

function MonthlyTargetTable({
  yearMonths,
  targets,
  actualsByMonth,
  onChange,
}: {
  yearMonths: string[];
  targets: MonthlyTargetEntry[];
  actualsByMonth: Record<string, { jobOpenings: number; recommendCount: number; offer: number; revenue: number }>;
  onChange: (next: MonthlyTargetEntry[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // map month → target row (空欄行も足す)
  const rowMap = useMemo(() => new Map(targets.map((t) => [t.month, t])), [targets]);
  const rows = yearMonths.map<MonthlyTargetEntry>((m) =>
    rowMap.get(m) ?? { month: m, offer: null, revenue: null, jobOpenings: null, recommendCount: null }
  );

  const updateCell = (
    month: string,
    key: keyof Omit<MonthlyTargetEntry, "month">,
    raw: string
  ) => {
    const cleaned = raw.trim();
    const numValue = cleaned === "" ? null : Number(cleaned.replace(/[,\s]/g, ""));
    const value = Number.isFinite(numValue) ? numValue : null;
    const next = rows.map((r) => (r.month === month ? { ...r, [key]: value } : r));
    onChange(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // 全部 null の月は除外
      const cleaned = rows.filter(
        (r) => r.offer != null || r.revenue != null || r.jobOpenings != null || r.recommendCount != null
      );
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyTargets: cleaned }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      setDirty(false);
      alert(`月次目標を保存しました (${cleaned.length} ヶ月分)`);
    } finally {
      setSaving(false);
    }
  };

  // ⌘/Ctrl + S で保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, rows]);

  const metrics: { key: keyof Omit<MonthlyTargetEntry, "month">; label: string; actualKey: "jobOpenings" | "recommendCount" | "offer" | "revenue"; yen?: boolean }[] = [
    { key: "jobOpenings", label: "求人数", actualKey: "jobOpenings" },
    { key: "recommendCount", label: "推薦者数", actualKey: "recommendCount" },
    { key: "offer", label: "内定者数", actualKey: "offer" },
    { key: "revenue", label: "売上 (円)", actualKey: "revenue", yen: true },
  ];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">月次目標</h2>
        <div className="flex items-center gap-2">
          {dirty ? <span className="text-[11px] text-[#92400E]">未保存の変更があります</span> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {saving ? "保存中..." : "目標を保存"}
          </button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--color-primary)] text-xs font-semibold text-white">
              <th rowSpan={2} className="border border-white/20 px-3 py-2 text-left align-middle">月</th>
              {metrics.map((m) => (
                <th key={m.key} colSpan={3} className="border border-white/20 px-3 py-2 text-center">
                  {m.label}
                </th>
              ))}
            </tr>
            <tr className="bg-[var(--color-primary)] text-[11px] font-semibold text-white">
              {metrics.map((m) => (
                <Fragment key={m.key}>
                  <th className="border border-white/20 px-2 py-1.5 text-right">目標</th>
                  <th className="border border-white/20 px-2 py-1.5 text-right">実績</th>
                  <th className="border border-white/20 px-2 py-1.5 text-right">達成率</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const actual = actualsByMonth[row.month] ?? { jobOpenings: 0, recommendCount: 0, offer: 0, revenue: 0 };
              return (
                <tr key={row.month} className="border-t border-gray-100">
                  <td className="border border-gray-100 px-3 py-2 font-mono text-[12.5px] text-[var(--color-text-dark)]">
                    {row.month}
                  </td>
                  {metrics.map((m) => {
                    const target = row[m.key];
                    const act = actual[m.actualKey];
                    const ratePct = target != null && target > 0 ? (act / target) * 100 : null;
                    return (
                      <Fragment key={m.key}>
                        <NumberCell
                          value={target}
                          onChange={(v) => updateCell(row.month, m.key, v)}
                        />
                        <td className="border border-gray-100 px-2 py-1 text-right text-[12.5px] text-gray-700 tabular-nums">
                          {m.yen ? `¥${act.toLocaleString()}` : act.toLocaleString()}
                        </td>
                        <td
                          className={`border border-gray-100 px-2 py-1 text-right text-[12.5px] tabular-nums ${
                            ratePct == null
                              ? "text-gray-400"
                              : ratePct >= 100
                                ? "text-[#16A34A] font-semibold"
                                : ratePct >= 70
                                  ? "text-[var(--color-primary)]"
                                  : "text-gray-700"
                          }`}
                        >
                          {ratePct == null ? "—" : `${ratePct.toFixed(2)}%`}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        目標欄を編集すると即時に上のグラフ・タコメーターに反映されます。
        <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px]">⌘/Ctrl + S</kbd> でも保存できます。
      </p>
    </section>
  );
}

function NumberCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (raw: string) => void;
}) {
  return (
    <td className="border border-gray-100 bg-[var(--color-light)]/40 px-2 py-1 text-right">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-[12.5px] tabular-nums focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30"
      />
    </td>
  );
}
