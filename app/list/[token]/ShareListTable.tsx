/**
 * 企業向けの推薦リストの表 (Airtable のような表。2026/11 土田さん)。
 * 見るだけ。中身はアプリのカンバン・候補者の情報から、開くたびに作る (アプリを直せば自動で変わる)。
 */

export type ShareCell = { text: string; href?: string };
export type ShareRow = { id: number; personId: string; stage: string; cells: ShareCell[] };

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

export default function ShareListTable(props: { companyName: string; dealTitle: string; updated: string; header: string[]; rows: ShareRow[] }) {
  const { rows } = props;
  const th = "sticky top-0 z-20 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2.5 text-left text-[13px] font-bold text-gray-800";
  const td = "border-b border-r border-gray-200 px-3 py-2.5 align-middle group-hover:bg-gray-50";

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
      </header>

      <main className="flex-1 p-3 sm:p-5">
        <div className="max-h-[calc(100vh-120px)] overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-30 w-10 text-center`}>#</th>
                <th className={th}>ID</th>
                <th className={`${th} min-w-[120px]`}>進捗</th>
                {props.header.map((h, i) => (
                  <th key={i} className={`${th} min-w-[110px]`}>
                    {h}
                  </th>
                ))}
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
                  {r.cells.map((c, ci) => (
                    <td key={ci} title={c.text || undefined} className={`${td} max-w-[260px] truncate text-gray-900`}>
                      {c.href ? (
                        <a href={c.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
                          {c.text}
                        </a>
                      ) : (
                        c.text
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={props.header.length + 3} className="px-4 py-10 text-center font-medium text-gray-700">
                    まだ候補者はいません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-gray-600">SMILE MATCHING</p>
      </main>
    </div>
  );
}
