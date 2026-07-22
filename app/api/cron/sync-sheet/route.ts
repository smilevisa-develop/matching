/**
 * スプシ全件同期を 1 時間ごとに走らせるための cron エンドポイント。
 *
 * Railway 側で Scheduled Job / GitHub Actions cron などから毎正時に叩く想定:
 *   GET /api/cron/sync-sheet
 *
 * 認証: Authorization: Bearer <CRON_SECRET> または ?secret=<CRON_SECRET>。
 *      本番 (NODE_ENV=production) では CRON_SECRET 必須。未設定なら 401 を返して実行しない。
 *      開発時のみ未設定で実行可。
 *      ※このパスは proxy.ts でログイン不要にしているため、ここが唯一の防御線。
 *
 * 動作: 系で変更があった候補者だけをスプシに反映する (apply=1 相当)。
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

/**
 * 認証結果。
 *   ok        … 実行してよい
 *   reason    … 失敗理由 (ログ/レスポンス用)
 *
 * このパスは proxy.ts でログイン不要にしているため、
 * 本番では CRON_SECRET を必須にする (未設定なら実行させない)。
 */
function verifySecret(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CRON_SECRET が未設定です (本番では必須)" };
    }
    return { ok: true }; // 開発時のみ認証スキップ
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("secret");
  if (bearer === secret || q === secret) return { ok: true };
  return { ok: false, reason: "unauthorized" };
}

export async function GET(req: Request) {
  const auth = verifySecret(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.reason ?? "unauthorized" }, { status: 401 });
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
    // updatedAt を動かさないよう生 SQL で更新する (理由は admin 側と同じ)
    if (result.syncedPersonIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Person" SET "sheetSyncedAt" = NOW() WHERE id = ANY($1::int[])`,
        result.syncedPersonIds,
      );
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
