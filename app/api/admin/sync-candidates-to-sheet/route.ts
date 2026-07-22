/**
 * 系の候補者を SYNC_SHEET_URL の「DB」シートに 差分同期 する admin エンドポイント。
 *
 * GET  /api/admin/sync-candidates-to-sheet             ← ドライラン (更新/追記の予定件数だけ返す)
 * GET  /api/admin/sync-candidates-to-sheet?apply=1     ← 本実行
 * GET  /api/admin/sync-candidates-to-sheet?sheet=名前  ← 別シートを指定
 * GET  /api/admin/sync-candidates-to-sheet?mode=append-missing
 *        ← スプシに ID が無い候補者を追記するだけ (既存行は一切更新しない)。
 *          移行時にスプシへ載っていなかった候補者を埋める用。
 *
 * 差分同期なので、スプシにしか無い旧データ (Google フォーム時代の行など) は消えない。
 * 詳細は lib/sheets-sync.ts のヘッダコメントを参照。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  parseSheetIdFromUrl,
  syncCandidatesUpsert,
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
    // ?sample=20 で差分プレビューの件数を増やせる (最大 50)
    const sampleLimit = Math.max(1, Math.min(50, Number(searchParams.get("sample") ?? 5)));
    // ?mode=append-missing でスプシに無い候補者の追記だけを行う (既存行は触らない)
    const mode = searchParams.get("mode") === "append-missing" ? "append-missing" : "changed";

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
        updatedAt: true,
        sheetSyncedAt: true,
        partner: { select: { name: true } },
        onboarding: {
          select: {
            englishName: true,
            birthDate: true,
            postalCode: true,
            address: true,
            updatedAt: true,
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
            updatedAt: true,
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

    const result = await syncCandidatesUpsert({
      opts: { spreadsheetId, sheetName, apply, sampleLimit, mode },
      candidates,
    });

    // 反映できた候補者は「反映済み」として記録。
    // 次回以降、この候補者に変更が入るまでスプシには触らない。
    //
    // ⚠️ prisma.person.updateMany を使うと @updatedAt が発火して updatedAt が
    //    sheetSyncedAt より後になり、毎回「変更あり」と判定され続けてしまう。
    //    updatedAt を動かさないよう生 SQL で更新する。
    if (apply && result.syncedPersonIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Person" SET "sheetSyncedAt" = NOW() WHERE id = ANY($1::int[])`,
        result.syncedPersonIds,
      );
    }

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
