/**
 * スプシ・Drive への全件同期 (候補者 + 企業マスタ + 案件 + Drive フォルダ)。
 *
 * 呼び出し元:
 *   - 毎時の cron (/api/cron/sync-sheet)
 *   - サイドバーの「同期」ボタン (/api/sync) … 定期実行を待たずに今すぐ反映したいとき
 */

import { prisma } from "@/lib/prisma";
import {
  parseSheetIdFromUrl,
  syncCandidatesUpsert,
  SYNC_SHEET_TAB_NAME,
  type PersonForSync,
} from "@/lib/sheets-sync";
import {
  readCompanyMasterFromSheet,
  resolveCompanyMasterSpreadsheetId,
  upsertCompanyMaster,
} from "@/lib/company-master-sync";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import {
  buildPersonFolderName,
  ensureCompanyDriveFolder,
  ensurePersonDriveFolder,
} from "@/lib/google-docs";

export type DriveFolderSyncResult = { companies: number; persons: number; failed: string[] };

/**
 * Drive フォルダがまだ無い企業・候補者に、フォルダを紐づける (無ければ作る)。
 * 候補者は登録時に作っているので、ここで拾うのは登録時に失敗した分だけ。
 */
async function syncDriveFolders(): Promise<DriveFolderSyncResult> {
  const result: DriveFolderSyncResult = { companies: 0, persons: 0, failed: [] };
  const noFolder = { OR: [{ driveFolderUrl: null }, { driveFolderUrl: "" }] };

  const companies = await prisma.company.findMany({
    where: noFolder,
    select: { id: true, name: true, externalId: true },
    orderBy: { id: "asc" },
  });
  for (const c of companies) {
    try {
      const folder = await ensureCompanyDriveFolder({ externalId: c.externalId, companyName: c.name });
      if (!folder.folderUrl) throw new Error("フォルダ URL が空");
      await prisma.company.update({ where: { id: c.id }, data: { driveFolderUrl: folder.folderUrl } });
      result.companies++;
    } catch (e) {
      result.failed.push(`${c.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const persons = await prisma.person.findMany({
    where: noFolder,
    select: { id: true, name: true, onboarding: { select: { englishName: true } } },
    orderBy: { id: "asc" },
  });
  for (const p of persons) {
    try {
      const folder = await ensurePersonDriveFolder({
        personId: p.id,
        personName: buildPersonFolderName({
          id: p.id,
          englishName: p.onboarding?.englishName ?? null,
          name: p.name,
        }),
      });
      if (!folder.folderUrl) throw new Error("フォルダ URL が空");
      await prisma.person.update({ where: { id: p.id }, data: { driveFolderUrl: folder.folderUrl } });
      result.persons++;
    } catch (e) {
      result.failed.push(`${p.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return result;
}

export async function runFullSheetSync(): Promise<Response> {
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

  // 候補者同期の前に、企業マスタ (スプシ) を Company に反映する。
  // (推薦先の「企業ID_企業名」を常に最新の企業マスタに追従させるため)
  // 失敗しても候補者同期は続行する。
  let companyMaster: { updated: number; created: number } | null = null;
  try {
    const masterId = resolveCompanyMasterSpreadsheetId();
    if (masterId) {
      const master = await readCompanyMasterFromSheet(masterId);
      const r = await upsertCompanyMaster(master, true);
      companyMaster = { updated: r.updated.length, created: r.created.length };
    }
  } catch (e) {
    console.warn("企業マスタ同期に失敗 (候補者同期は継続):", e instanceof Error ? e.message : e);
  }

  // 候補者同期の前に Drive フォルダを揃える (スプシに載せるフォルダ URL が空にならないように)。
  // 失敗しても以降の同期は続行する。
  let drive: DriveFolderSyncResult | { error: string };
  try {
    drive = await syncDriveFolders();
  } catch (e) {
    drive = { error: e instanceof Error ? e.message : "error" };
    console.warn("Drive フォルダの同期に失敗:", drive.error);
  }

  const rawPersons = await prisma.person.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      nationality: true,
      residenceStatus: true,
      driveFolderUrl: true,
      recommendedCompany: true,
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
          deal: { select: { company: { select: { name: true, externalId: true } } } },
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
    // 案件・企業を企業データベース(スプシ)へ反映する。
    // 候補者と同じく「系で追加・変更したものが自動で載る」状態にするため cron に含める。
    // 失敗しても候補者同期の結果は返す (この同期だけのために全体を落とさない)。
    // 案件・企業を企業データベース(スプシ)へ反映する (保存時にも走るが、取りこぼしの保険)。
    // 失敗しても候補者同期の結果は返し、dealSyncError で GitHub Actions に失敗を伝える。
    const db = await requestCompanyDatabaseSync();
    const companies = db.companies;
    const deals = db.error ? { error: db.error } : db.deals;
    const dealSyncError = db.error;

    return Response.json({
      ok: true,
      result,
      companyMaster,
      drive,
      companies,
      deals,
      dealSyncError,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("cron/sync-sheet error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 }
    );
  }
}
