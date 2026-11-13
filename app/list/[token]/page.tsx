import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import { buildRecommendationCellValue, getRecommendationColumnLabel } from "@/lib/recommendation-row";
import { resolveDriveNames } from "@/lib/recommendation-links";
import { companyStageOptions } from "@/lib/share-list";
import ShareListTable, { type ShareCell, type ShareRow } from "./ShareListTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "推薦リスト", robots: { index: false, follow: false } };

/** 社内だけの不合格 (推薦する前に外した人)。企業には見せない */
const HIDDEN_STAGES = new Set(["書類NG", "面談NG"]);

/**
 * 企業向けの推薦リスト。GET /list/{Deal.shareToken}。ログインなしで開ける。
 * 列は推薦リストのスプシと同じ (ID・進捗・設定の列・面接時間・備考)。開くたびにアプリの今の内容を出す。
 * 企業は 進捗・面接時間・備考 をこの画面で書け、アプリに反映される (/api/list/[token])。
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
  const candidates = all.filter((c) => !HIDDEN_STAGES.has(c.stage));

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
    companyNote: c.companyNote ?? "",
    cells: columns.map((k): ShareCell => {
      const v = buildRecommendationCellValue(c, k);
      if (typeof v === "string" && v.startsWith("http")) return { text: names.get(v) ?? "開く", href: v };
      return { text: v === null || v === undefined ? "" : String(v) };
    }),
  }));
  const updated = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <ShareListTable
      token={token}
      companyName={deal.company.name}
      dealTitle={deal.title}
      updated={updated}
      header={header}
      rows={rows}
      stageOptions={companyStageOptions(deal.company.companyKind)}
    />
  );
}
