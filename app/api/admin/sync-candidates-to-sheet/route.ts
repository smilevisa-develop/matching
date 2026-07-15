/**
 * 全候補者を SYNC_SHEET_URL の「DB」シートに書き出す admin エンドポイント。
 *
 * GET  /api/admin/sync-candidates-to-sheet             ← ドライラン (件数と先頭 3 行のプレビューだけ)
 * GET  /api/admin/sync-candidates-to-sheet?apply=1     ← 本実行 (ヘッダ 2 行目, データ 3 行目 以降を全上書き)
 * GET  /api/admin/sync-candidates-to-sheet?sheet=名前  ← 別シートを指定して上書き (旧: !バックアップ! など)
 *
 * 同期先シートは lib/sheets-sync.ts の SYNC_SHEET_TAB_NAME で管理 (`DB`)。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  parseSheetIdFromUrl,
  syncAllCandidatesFullOverwrite,
  SYNC_SHEET_TAB_NAME,
  type PersonForSync,
} from "@/lib/sheets-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const apply = searchParams.get("apply") === "1";
    const sheetName = searchParams.get("sheet") ?? SYNC_SHEET_TAB_NAME;

    const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
    if (!sheetUrl) {
      return Response.json(
        { ok: false, error: "SYNC_SHEET_URL 環境変数が未設定です" },
        { status: 500 }
      );
    }
    const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
    if (!spreadsheetId) {
      return Response.json(
        { ok: false, error: `SYNC_SHEET_URL から Sheet ID を解析できません: ${sheetUrl}` },
        { status: 500 }
      );
    }

    // 全候補者を必要 relation 付きで取得
    const rawPersons = await prisma.person.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        nationality: true,
        residenceStatus: true,
        driveFolderUrl: true,
        createdAt: true,
        partner: { select: { name: true } },
        onboarding: {
          select: {
            englishName: true,
            birthDate: true,
            postalCode: true,
            address: true,
          },
        },
        resumeProfile: {
          select: {
            gender: true,
            visaExpiryDate: true,
            japaneseLevel: true,
            traineeExperience: true,
            preferenceNote: true,
            remarks: true,
            resumeFileUrl: true,
          },
        },
        dealCandidates: {
          select: {
            stage: true,
            updatedAt: true,
            deal: { select: { company: { select: { name: true } } } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    const candidates: PersonForSync[] = rawPersons;

    const result = await syncAllCandidatesFullOverwrite({
      opts: { spreadsheetId, sheetName, apply },
      candidates,
    });

    return Response.json({
      ok: true,
      spreadsheetId,
      sheetUrl,
      apply,
      result,
    });
  } catch (error) {
    console.error("sync-candidates-to-sheet error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
