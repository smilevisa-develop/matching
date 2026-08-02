/**
 * 履歴書リンクの誤設定クリーンアップ (要管理者)。
 *
 * AI取込の旧フォールバックで、resumeFileUrl が「履歴書以外の書類(パスポート等)」を
 * 指してしまった候補者を検出し、その resumeFileUrl を空欄化 + スプシの履歴書列も空欄化する。
 * 履歴書と一致するもの・判定不能(該当書類なし)のものは触らない (古い正しいリンクは維持)。
 *
 * POST /api/admin/fix-resume-links          ドライラン (対象件数とサンプル)
 * POST /api/admin/fix-resume-links?apply=1  実行
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";
import {
  getSheetsClient,
  parseSheetIdFromUrl,
  SYNC_SHEET_TAB_NAME,
  DATA_START_ROW,
} from "@/lib/sheets-sync";
import { formatPersonIdPrefix } from "@/lib/google-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 履歴書列 = V (0-based 21)
const RESUME_COLUMN_LETTER = "V";

type WrongRow = { personId: number; kind: string };

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const apply = new URL(req.url).searchParams.get("apply") === "1";
    const body = await req.json().catch(() => ({}));
    // body.personIds が指定されていれば、その候補者のスプシ履歴書列だけをクリアする
    // (DBを先に空欄化済みで自動検出できないケース用)
    const explicitIds: number[] = Array.isArray(body?.personIds)
      ? body.personIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : [];

    let wrongPersonIds: number[];
    let rows: WrongRow[] = [];
    if (explicitIds.length > 0) {
      wrongPersonIds = [...new Set(explicitIds)];
    } else {
      // resumeFileUrl が「履歴書以外の書類」に一致している候補者 (=誤設定)
      rows = await prisma.$queryRaw<WrongRow[]>`
        SELECT DISTINCT rp."personId" AS "personId", pd.kind AS kind
        FROM "ResumeProfile" rp
        JOIN "PortalDocument" pd
          ON pd."personId" = rp."personId" AND pd."fileUrl" = rp."resumeFileUrl"
        WHERE rp."resumeFileUrl" IS NOT NULL AND rp."resumeFileUrl" <> '' AND pd.kind <> 'resume'
      `;
      wrongPersonIds = [...new Set(rows.map((r) => r.personId))];
    }

    if (!apply) {
      return Response.json({
        ok: true,
        apply: false,
        count: wrongPersonIds.length,
        samples: rows.slice(0, 20),
      });
    }

    // 1. DB の resumeFileUrl を空欄化
    if (wrongPersonIds.length > 0) {
      await prisma.resumeProfile.updateMany({
        where: { personId: { in: wrongPersonIds } },
        data: { resumeFileUrl: null },
      });
    }

    // 2. スプシの履歴書列(V)を該当行だけ空欄化
    let sheetCleared = 0;
    const warnings: string[] = [];
    const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
    const spreadsheetId = sheetUrl ? parseSheetIdFromUrl(sheetUrl) : null;
    if (!spreadsheetId) {
      warnings.push("SYNC_SHEET_URL 未設定のため、スプシの履歴書列は未処理 (DBのみ空欄化)");
    } else if (wrongPersonIds.length > 0) {
      try {
        const sheets = await getSheetsClient();
        // A列(ID)を読み、ID→行番号 のマップを作る
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${SYNC_SHEET_TAB_NAME}'!A:A`,
        });
        const aVals = res.data.values ?? [];
        const idToRow = new Map<string, number>();
        for (let i = DATA_START_ROW - 1; i < aVals.length; i++) {
          const idStr = String(aVals[i]?.[0] ?? "").trim();
          if (idStr) idToRow.set(idStr, i + 1); // 1-based
        }
        const data = wrongPersonIds
          .map((pid) => idToRow.get(formatPersonIdPrefix(pid)))
          .filter((r): r is number => Boolean(r))
          .map((row) => ({ range: `'${SYNC_SHEET_TAB_NAME}'!${RESUME_COLUMN_LETTER}${row}`, values: [[""]] }));
        if (data.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: "RAW", data },
          });
          sheetCleared = data.length;
        }
      } catch (e) {
        warnings.push(`スプシの履歴書列クリアに失敗: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    return Response.json({
      ok: true,
      apply: true,
      blankedInDb: wrongPersonIds.length,
      sheetCleared,
      warnings,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
