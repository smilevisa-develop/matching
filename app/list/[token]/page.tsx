import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import { buildRecommendationCellValue, getRecommendationColumnLabel } from "@/lib/recommendation-row";
import { resolveDriveNames } from "@/lib/recommendation-links";
import { readListStages, stageOnList } from "@/lib/list-stages";
import ShareListTable, { type ShareCell, type ShareRow } from "./ShareListTable";

export const dynamic = "force-dynamic";
const SHARE_DESCRIPTION = "ご紹介する候補者の一覧です。";

/** リンクのプレビュー (Slack・LINE など) に社内向けの説明が出ないよう、このページ用に上書きする */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const deal = token && token.length >= 16
    ? await prisma.deal.findUnique({ where: { shareToken: token }, select: { company: { select: { name: true } } } })
    : null;
  const title = deal ? `${deal.company.name} 様 推薦リスト` : "推薦リスト";
  return {
    title,
    description: SHARE_DESCRIPTION,
    openGraph: { title, description: SHARE_DESCRIPTION, siteName: "SMILE MATCHING", type: "website" },
    twitter: { card: "summary", title, description: SHARE_DESCRIPTION },
    robots: { index: false, follow: false },
  };
}


/**
 * 企業向けの推薦リスト。GET /list/{Deal.shareToken}。ログインなしで開ける。
 * 列は推薦リストのスプシと同じ (ID・進捗・設定の列)。開くたびにアプリの今の内容を出す。
 * ふだんは見るだけ。右上の鉛筆 → 暗証番号で、その画面の中だけ直せる (2026-11-18 土田さん。api/list/[token]/edit)。
 * 見た目は表計算に近い表 (2026/11 土田さん: Google のまねはせず、Airtable のように見やすく親しみやすく)
 */
export default async function ShareListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();
  const deal = await prisma.deal.findUnique({ where: { shareToken: token }, include: { company: true } });
  if (!deal) notFound();

  const [all, settings] = await Promise.all([
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
  const listStages = readListStages(deal.listStages);
  const candidates = all.filter((c) => stageOnList(c.stage, listStages));

  const columns = sanitizeRecommendationColumns(settings?.recommendationColumns);
  const header = columns.map((k) => getRecommendationColumnLabel(k));
  const linkKeys = new Set(["resumeUrl", "driveFolderUrl"]);
  const urls = candidates
    .flatMap((c) => columns.filter((k) => linkKeys.has(k)).map((k) => buildRecommendationCellValue(c, k)))
    .filter((v): v is string => typeof v === "string" && v.startsWith("http"));
  const names = await resolveDriveNames(urls);

  const rows: ShareRow[] = candidates.map((c) => ({
    id: c.id,
    personId: String(c.person.id),
    stage: c.stage ?? "",
    interviewTime: c.interviewTime ?? "",
    note: c.companyNote ?? "",
    cells: columns.map((k): ShareCell => {
      const v = buildRecommendationCellValue(c, k);
      if (typeof v === "string" && v.startsWith("http")) return { key: k, text: names.get(v) ?? "開く", href: v };
      const base = v === null || v === undefined ? "" : String(v);
      // リストの上で直した値 (暗証番号で編集。候補者の元の情報は変えない)
      const over = (c.listOverrides && typeof c.listOverrides === "object" ? (c.listOverrides as Record<string, unknown>)[k] : undefined);
      return typeof over === "string" ? { key: k, text: over, base, edited: true } : { key: k, text: base, base };
    }),
  }));
  const updated = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <ShareListTable
      companyName={deal.company.name}
      dealTitle={deal.title}
      updated={updated}
      token={token}
      header={header}
      rows={rows}
    />
  );
}
