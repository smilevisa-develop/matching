/**
 * スプシ全件同期を 1 時間ごとに走らせるための cron エンドポイント。
 *
 * Railway 側で Scheduled Job / GitHub Actions cron などから毎正時に叩く想定:
 *   GET /api/cron/sync-sheet
 *
 * 認証: CRON_SECRET が設定されている場合、Authorization: Bearer <CRON_SECRET>
 *      か ?secret=<CRON_SECRET> で認証。未設定なら誰でも実行可 (開発用)。
 *
 * 動作: sync-candidates-to-sheet の apply=1 相当を無認証で実行。
 */

import { prisma } from "@/lib/prisma";
import {
  parseSheetIdFromUrl,
  syncCandidatesUpsert,
  SYNC_SHEET_TAB_NAME,
  type PersonForSync,
} from "@/lib/sheets-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function verifySecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true; // 未設定なら認証スキップ (開発用)
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("secret");
  return bearer === secret || q === secret;
}

export async function GET(req: Request) {
  if (!verifySecret(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
  if (!sheetUrl) {
    return Response.json(
      { ok: false, error: "SYNC_SHEET_URL 未設定 (cron スキップ)" },
      { status: 500 }
    );
  }
  const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
  if (!spreadsheetId) {
    return Response.json(
      { ok: false, error: "SYNC_SHEET_URL から Sheet ID 解析不能" },
      { status: 500 }
    );
  }

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
        select: { englishName: true, birthDate: true, postalCode: true, address: true, updatedAt: true },
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

  try {
    const result = await syncCandidatesUpsert({
      opts: { spreadsheetId, sheetName: SYNC_SHEET_TAB_NAME, apply: true },
      candidates,
    });
    if (result.syncedPersonIds.length > 0) {
      await prisma.person.updateMany({
        where: { id: { in: result.syncedPersonIds } },
        data: { sheetSyncedAt: new Date() },
      });
    }
    return Response.json({ ok: true, result, at: new Date().toISOString() });
  } catch (error) {
    console.error("cron/sync-sheet error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 }
    );
  }
}
