import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { computeKpiDashboard, type KpiPeriod } from "@/lib/kpi-dashboard";

export const dynamic = "force-dynamic";

const PERIODS: { id: KpiPeriod; label: string }[] = [
  { id: "1", label: "今月" },
  { id: "2", label: "直近2か月" },
  { id: "3", label: "直近3か月" },
  { id: "6", label: "直近6か月" },
  { id: "all", label: "全期間" },
];

/**
 * KPI ダッシュボード。期間を選ぶと、その期間の件数・転換率・かかった日数・内訳と、過去も含めた累計を出す。
 * 「直近2か月の内定辞退は？」「面接合格まで何日？」などをすぐ見られるようにするためのページ。
 */
export default async function KpiPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireCurrentAccount();
  const { period: raw } = await searchParams;
  const period = (PERIODS.some((p) => p.id === raw) ? raw : "2") as KpiPeriod;
  const k = await computeKpiDashboard(period);
  const label = PERIODS.find((p) => p.id === period)?.label ?? "";
  const monthLabel = (m: string) => `${Number(m.slice(5))}月`;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">KPIダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-500">
            {period === "all" ? "全期間" : `${k.fromMonth.replace("-", "年")}月〜今日`} の実績と、過去も含めた累計
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`/kpi?period=${p.id}`}
              className={`rounded-lg px-3 py-1.5 ${p.id === period ? "bg-[var(--color-primary)] text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-[var(--color-primary)]"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* 期間の件数 */}
      <Card title={`${label}の件数`}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="新規候補者" value={k.newCandidates} />
          <Stat label="推薦" value={k.counts["推薦"]} />
          <Stat label="面接" value={k.counts["面接"]} />
          <Stat label="内定" value={k.counts["内定"]} strong />
          <Stat label="内定承諾" value={k.counts["内定承諾"]} />
          <Stat label="内定辞退" value={k.counts["内定辞退"]} warn={k.counts["内定辞退"] > 0} />
          <Stat label="入社" value={k.joined} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          接続 {k.counts["接続"]} ・ 事前面談 {k.counts["事前面談"]} ・ 応募辞退 {k.counts["応募辞退"]} ・ 不合格 {k.counts["不合格"]} ・ 書類NG {k.counts["書類NG"]} ・ 面談NG{" "}
          {k.counts["面談NG"]} ・ 選考NG {k.counts["選考NG"]}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="転換率（期間内にその段階に入った人のうち、次へ進んだ人）">
          <ul className="divide-y divide-gray-100 text-sm">
            {k.conversions.map((c) => (
              <li key={c.label} className="flex items-center justify-between py-2">
                <span className="text-gray-600">{c.label}</span>
                <span className="tabular-nums text-[var(--color-text-dark)]">
                  <span className="font-semibold">{c.value === null ? "-" : `${c.value}%`}</span>
                  <span className="ml-1 text-xs text-gray-400">（{c.base}）</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="かかった日数（平均 / 中央値）">
          <ul className="divide-y divide-gray-100 text-sm">
            {k.durations.map((d) => (
              <li key={d.label} className="flex items-center justify-between py-2">
                <span className="text-gray-600">{d.label}</span>
                <span className="tabular-nums text-[var(--color-text-dark)]">
                  {d.n === 0 ? (
                    <span className="text-gray-400">データなし</span>
                  ) : (
                    <>
                      <span className="font-semibold">{d.avg}日</span>
                      <span className="text-gray-400"> / {d.median}日 （{d.n}件）</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="月別の推移（直近6か月）">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-2">月</th>
              {["新規候補者", "推薦", "面接", "内定", "内定辞退", "不合格"].map((h) => (
                <th key={h} className="py-2 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {k.monthly.map((m) => (
              <tr key={m.month}>
                <td className="py-2 text-gray-600">{monthLabel(m.month)}</td>
                {[m.candidates, m.recommend, m.interview, m.offer, m.decline, m.reject].map((v, i) => (
                  <td key={i} className={`py-2 text-right tabular-nums ${v ? "text-[var(--color-text-dark)]" : "text-gray-300"}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown title="担当者別" rows={k.byOwner} />
        <Breakdown title="パートナー別（上位10）" rows={k.byPartner} />
        <Breakdown title="企業別（上位10）" rows={k.byCompany} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`新規候補者の国籍（${label}）`}>
          {k.byNationality.length === 0 ? (
            <p className="text-sm text-gray-400">なし</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {k.byNationality.map((n) => (
                <li key={n.key} className="flex justify-between">
                  <span className="text-gray-600">{n.key}</span>
                  <span className="tabular-nums">{n.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="累計（過去分をすべて含む）">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="候補者" value={k.totals.candidates} />
            <Stat label="推薦" value={k.totals.recommend} />
            <Stat label="面接" value={k.totals.interview} />
            <Stat label="内定" value={k.totals.offer} strong />
            <Stat label="内定辞退" value={k.totals.decline} />
            <Stat label="不合格" value={k.totals.reject} />
            <Stat label="入社" value={k.totals.joined} />
            <Stat label="求人" value={k.totals.deals} />
          </div>
        </Card>
      </div>

      <p className="text-xs text-gray-400">
        ※ 推薦・面接などの件数と日数は、カンバンで候補者を動かしたときに入れた日付で数えます。転換率は「期間内にその段階に入った人のうち、次の段階まで進んだ人」の割合です。
        段階を飛ばして進めた分 (接続済み → 内定承諾 など) は件数には入れ、日数には入れていません。2026/10/19 より前の動きは日付の記録が無いため、
        それ以前の月は少なく出ます（内定・内定承諾は内定者管理の日付も使っています）。累計は案件ごとの人数の合計で、過去分も含みます。テスト企業は除いています。
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-dark)]">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, strong = false, warn = false }: { label: string; value: number; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${strong ? "bg-[var(--color-light)]" : "bg-gray-50"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? "text-red-600" : "text-[var(--color-text-dark)]"}`}>{value}</p>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; recommend: number; interview: number; offer: number }[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">この期間の動きはありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1.5" />
              <th className="py-1.5 text-right">推薦</th>
              <th className="py-1.5 text-right">面接</th>
              <th className="py-1.5 text-right">内定</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-[10rem] truncate py-1.5 text-gray-700" title={r.key}>
                  {r.key}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.recommend}</td>
                <td className="py-1.5 text-right tabular-nums">{r.interview}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{r.offer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
