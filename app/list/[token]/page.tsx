import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import { buildRecommendationCellValue, getRecommendationColumnLabel } from "@/lib/recommendation-row";
import { resolveDriveNames } from "@/lib/recommendation-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "推薦リスト", robots: { index: false, follow: false } };

/**
 * 企業向けの推薦リスト (見るだけ)。GET /list/{Deal.shareToken}。未ログインで開ける。
 * 中身は推薦リストのスプシ (app/api/recommendations/save-to-drive) と同じ列で、開くたびにアプリの今の内容を出す。
 * 見た目は Google スプレッドシートに寄せている (列の A B C、行番号、見出しの行、進捗のプルダウン風の印、下のシートのタブ)
 */
const SHEET_FONT = { fontFamily: "Arial, 'Hiragino Sans', 'Noto Sans JP', sans-serif" };

function colName(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export default async function ShareListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();
  const deal = await prisma.deal.findUnique({ where: { shareToken: token }, include: { company: true } });
  if (!deal) notFound();

  const [candidates, settings] = await Promise.all([
    prisma.dealCandidate.findMany({
      where: { dealId: deal.id },
      include: {
        person: {
          include: {
            onboarding: true,
            resumeProfile: true,
            partner: { select: { name: true } },
            resumeDocuments: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.coreSettings.findUnique({ where: { id: 1 } }),
  ]);

  const columns = sanitizeRecommendationColumns(settings?.recommendationColumns);
  const header = ["ID", "進捗", ...columns.map((k) => getRecommendationColumnLabel(k)), "面接時間", "備考"];
  const linkKeys = new Set(["resumeUrl", "driveFolderUrl"]);
  const urls = candidates.flatMap((c) => columns.filter((k) => linkKeys.has(k)).map((k) => buildRecommendationCellValue(c, k))).filter((v): v is string => typeof v === "string" && v.startsWith("http"));
  const names = await resolveDriveNames(urls);

  type Cell = { text: string; href?: string; chip?: boolean };
  const rows: Cell[][] = candidates.map((c) => [
    { text: String(c.person.id) },
    { text: c.stage ?? "", chip: true },
    ...columns.map((k): Cell => {
      const v = buildRecommendationCellValue(c, k);
      if (typeof v === "string" && v.startsWith("http")) return { text: names.get(v) ?? v, href: v };
      return { text: v === null || v === undefined ? "" : String(v) };
    }),
    { text: "" },
    { text: "" },
  ]);
  const numeric = (i: number, t: string) => i === 0 || /^-?[\d,.]+$/.test(t);
  const title = `${deal.company.name}様_推薦リスト`;
  const updated = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-screen flex-col bg-white text-[#202124]" style={SHEET_FONT}>
      {/* 上の帯 (スプシの題名の行) */}
      <header className="flex items-center gap-3 border-b border-[#e0e0e0] bg-[#f9fbfd] px-4 py-2">
        <svg width="28" height="36" viewBox="0 0 28 36" aria-hidden>
          <path d="M18 0H3a3 3 0 0 0-3 3v30a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V10z" fill="#0F9D58" />
          <path d="M18 0v7a3 3 0 0 0 3 3h7z" fill="#87CEAC" />
          <rect x="6" y="15" width="16" height="13" rx="1" fill="#fff" />
          <path d="M6 19.3h16M6 23.6h16M12 15v13" stroke="#0F9D58" strokeWidth="1.4" />
        </svg>
        <div className="min-w-0">
          <h1 className="truncate text-lg text-[#202124]">{title}</h1>
          <p className="text-xs text-[#444746]">表示のみ　・　{updated} 時点の内容（開くたびに最新になります）</p>
        </div>
        <span className="ml-auto rounded-full bg-[#c2e7ff] px-4 py-1.5 text-sm font-medium text-[#001d35]">閲覧のみ</span>
      </header>
      {/* 数式バー風 */}
      <div className="flex items-center border-b border-[#e0e0e0] text-sm">
        <span className="w-20 border-r border-[#e0e0e0] px-3 py-1 text-[#444746]">A1</span>
        <span className="px-3 py-1 text-[#444746]">fx</span>
        <span className="px-1 py-1">ID</span>
      </div>

      {/* 表 */}
      <div className="flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 h-6 w-12 min-w-12 border-b border-r border-[#c0c0c0] bg-[#f8f9fa]" />
              {header.map((_, i) => (
                <th key={i} className="sticky top-0 z-20 h-6 border-b border-r border-[#c0c0c0] bg-[#f8f9fa] px-2 text-center text-xs font-normal text-[#444746]">
                  {colName(i)}
                </th>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 top-6 z-30 border-b-[3px] border-r border-b-[#bdbdbd] border-r-[#c0c0c0] bg-[#f8f9fa] text-center text-xs text-[#444746]">1</td>
              {header.map((h, i) => (
                <th
                  key={i}
                  className="sticky top-6 z-20 min-w-[110px] whitespace-nowrap border-b-[3px] border-r border-b-[#bdbdbd] border-r-[#e2e3e3] bg-[#e8f0ea] px-2 py-2 text-left font-bold text-[#202124]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td className="sticky left-0 z-10 border-b border-r border-[#c0c0c0] bg-[#f8f9fa] text-center text-xs text-[#444746]">{ri + 2}</td>
                {r.map((c, ci) => (
                  <td
                    key={ci}
                    title={c.text || undefined}
                    className={`h-[25px] max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-[#e2e3e3] px-2 py-0.5 align-middle ${numeric(ci, c.text) ? "text-right" : "text-left"}`}
                  >
                    {c.chip && c.text ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#e6e6e6] py-px pl-2.5 pr-1.5 text-[12px] text-[#202124]">
                        {c.text}
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                          <path d="M2 3.5l3 3 3-3" fill="none" stroke="#444746" strokeWidth="1.4" />
                        </svg>
                      </span>
                    ) : c.href ? (
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-[#1155cc] underline">
                        {c.text}
                      </a>
                    ) : (
                      c.text
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {/* 空の行 (スプシらしく) */}
            {Array.from({ length: Math.max(8, 20 - rows.length) }, (_, i) => (
              <tr key={`e${i}`}>
                <td className="sticky left-0 z-10 h-[25px] border-b border-r border-[#c0c0c0] bg-[#f8f9fa] text-center text-xs text-[#444746]">{rows.length + i + 2}</td>
                {header.map((_, ci) => (
                  <td key={ci} className="border-b border-r border-[#e2e3e3]" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 下のシートのタブ */}
      <footer className="flex items-center gap-1 border-t border-[#e0e0e0] bg-[#f9fbfd] px-3 py-1.5 text-sm">
        <span className="px-2 text-lg leading-none text-[#444746]">＋</span>
        <span className="px-2 text-lg leading-none text-[#444746]">≡</span>
        <span className="rounded-t bg-[#e1e9f7] px-4 py-1.5 font-medium text-[#0b57d0]">推薦リスト</span>
        <span className="ml-auto text-xs text-[#444746]">{rows.length} 名</span>
      </footer>
    </div>
  );
}
