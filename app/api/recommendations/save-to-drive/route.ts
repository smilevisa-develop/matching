import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensureCompanyDriveFolder } from "@/lib/google-docs";
import {
  RECOMMENDATION_PROGRESS_OPTIONS,
  sanitizeRecommendationColumns,
} from "@/lib/recommendation-columns";
import {
  buildRecommendationCellValue,
  getRecommendationColumnLabel,
} from "@/lib/recommendation-row";
import { google } from "googleapis";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const dealId = Number(body?.dealId);
    // 複数ステージ対応: stages[] / 単一 stage どちらも受け付ける
    const stagesInput: string[] | null = Array.isArray(body?.stages)
      ? (body.stages as unknown[]).map((s) => String(s)).filter(Boolean)
      : typeof body?.stage === "string" && body.stage !== "all"
        ? [String(body.stage)]
        : body?.stage === "all"
          ? null
          : ["接続済み"];
    if (!Number.isFinite(dealId)) {
      return Response.json({ ok: false, error: "dealId が必要です" }, { status: 400 });
    }

    const [deal, candidates, settings] = await Promise.all([
      prisma.deal.findUnique({
        where: { id: dealId },
        include: { company: true },
      }),
      prisma.dealCandidate.findMany({
        where: {
          dealId,
          ...(stagesInput && stagesInput.length > 0 ? { stage: { in: stagesInput } } : {}),
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

    if (!deal) {
      return Response.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });
    }

    const userColumns = sanitizeRecommendationColumns(settings?.recommendationColumns);

    // 固定 + 設定列構成: ID + 進捗 + (設定列…) + 備考
    const header: string[] = [
      "ID",
      "進捗",
      ...userColumns.map((key) => getRecommendationColumnLabel(key)),
      "備考",
    ];
    const dataRows: (string | number)[][] = candidates.map((candidate) => {
      // 進捗の初期値は候補者の現ステージ (接続済み / 推薦済み 等)。
      // 受信側企業が Sheets 上の dropdown で更新する。
      const cells: (string | number)[] = [candidate.person.id, candidate.stage ?? ""];
      for (const key of userColumns) cells.push(buildRecommendationCellValue(candidate, key));
      cells.push("");
      return cells;
    });
    const csv = [
      header.map(csvEscape).join(","),
      ...dataRows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    // テンプレ機能は廃止 (Sheets API のテンプレ複製で名前のみ変わって中身が反映されない問題のため)
    // 常に CSV → Sheets 新規ファイル作成方式で出力する

    // 企業フォルダを確保
    const folder = await ensureCompanyDriveFolder({
      existingFolderUrl: deal.company.driveFolderUrl,
      externalId: deal.company.externalId,
      companyName: deal.company.name,
    });
    if (!deal.company.driveFolderUrl) {
      await prisma.company.update({
        where: { id: deal.company.id },
        data: { driveFolderUrl: folder.folderUrl },
      });
    }

    // Google API 認証 (Drive + Sheets)
    const authKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
    const authEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    if (!authKey || !authEmail) {
      return Response.json({ ok: false, error: "GOOGLE_SERVICE_ACCOUNT_* が未設定です" }, { status: 500 });
    }
    const auth = new google.auth.JWT({
      email: authEmail,
      key: authKey.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    await auth.authorize();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const date = new Date().toISOString().slice(0, 10);
    const safeTitle = deal.title.replace(/[\\/:*?"<>|]/g, "");
    const fileName = `${date}_${safeTitle}_推薦リスト`;

    // CSV を Sheets として変換アップロード (新規ファイルとして作成)
    const buffer = Buffer.from(csv, "utf-8");
    const { Readable } = await import("node:stream");
    const created = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folder.folderId!],
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
      media: {
        mimeType: "text/csv",
        body: Readable.from(buffer),
      },
      fields: "id,webViewLink,name,mimeType",
    });
    const spreadsheetId = created.data.id;
    const webViewLink = created.data.webViewLink;
    const progressColumnIndex = 1; // ID(0), 進捗(1)
    const dataStartRow = 1; // ヘッダーは row 0、データは row 1 から

    // 進捗列に dropdown (data validation)、ヘッダー装飾、1 行目固定を付与
    if (spreadsheetId) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets(properties(sheetId,title))",
        });
        const firstSheet = meta.data.sheets?.[0]?.properties;
        if (firstSheet?.sheetId !== undefined && firstSheet?.sheetId !== null) {
          const numRows = dataRows.length + dataStartRow; // header + data rows
          const requests: Record<string, unknown>[] = [
            {
              setDataValidation: {
                range: {
                  sheetId: firstSheet.sheetId,
                  startRowIndex: dataStartRow,
                  endRowIndex: numRows,
                  startColumnIndex: progressColumnIndex,
                  endColumnIndex: progressColumnIndex + 1,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: RECOMMENDATION_PROGRESS_OPTIONS.map((v) => ({ userEnteredValue: v })),
                  },
                  strict: false,
                  showCustomUi: true,
                },
              },
            },
            {
              repeatCell: {
                range: {
                  sheetId: firstSheet.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    horizontalAlignment: "CENTER",
                    backgroundColor: { red: 0.94, green: 0.97, blue: 0.95 },
                  },
                },
                fields: "userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)",
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId: firstSheet.sheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ];
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests },
          });
        }
      } catch (sheetsError) {
        // 装飾系が失敗しても保存自体は成功扱いにする
        console.warn("recommendations Sheets formatting failed:", sheetsError);
      }
    }

    return Response.json({
      ok: true,
      fileName,
      fileUrl: webViewLink,
      folderUrl: folder.folderUrl,
      columnCount: header.length,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
