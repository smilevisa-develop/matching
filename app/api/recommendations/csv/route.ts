import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import {
  buildRecommendationCellValue,
  getRecommendationColumnLabel,
} from "@/lib/recommendation-row";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const dealId = Number(searchParams.get("dealId"));
    // 新: ?stages=接続済み,事前面談済み (互換: ?stage=接続済み)
    const stagesParam = searchParams.get("stages") ?? searchParams.get("stage") ?? "接続済み";
    const stageList = stagesParam === "all" ? null : stagesParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (!Number.isFinite(dealId)) {
      return new Response("dealId is required", { status: 400 });
    }

    const [candidates, settings] = await Promise.all([
      prisma.dealCandidate.findMany({
        where: {
          dealId,
          ...(stageList && stageList.length > 0 ? { stage: { in: stageList } } : {}),
        },
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

    const userColumns = sanitizeRecommendationColumns(settings?.recommendationColumns);

    // 固定列: ID + 進捗 (左) + 設定列 + 備考 (右)
    const header = [
      "ID",
      "進捗",
      ...userColumns.map((key) => getRecommendationColumnLabel(key)),
      "備考",
    ];

    const rows = candidates.map((candidate) => {
      const cells: (string | number)[] = [
        candidate.person.id,
        // 進捗の初期値はシステム上の現ステージ (接続済み / 推薦済み 等)。
        // 受信側企業が Sheets 上の dropdown で更新する。
        candidate.stage ?? "",
      ];
      for (const key of userColumns) {
        cells.push(buildRecommendationCellValue(candidate, key));
      }
      cells.push(""); // 備考
      return cells.map(csvEscape).join(",");
    });

    const csv = "\uFEFF" + [header.map(csvEscape).join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="recommendations-${dealId}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(error.message, { status: error.status });
    }
    return new Response(error instanceof Error ? error.message : "error", { status: 500 });
  }
}
