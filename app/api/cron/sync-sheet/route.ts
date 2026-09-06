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
 * 動作: 系で変更があった候補者をスプシに反映し、続けて
 *      案件・企業を企業データベース(案件情報 / 企業マスタ)へ差分同期する。
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
import {
  appendCompaniesToMaster,
  syncDealsToSheet,
  type CompanyForMaster,
  type DealForSheet,
} from "@/lib/deal-sheet-sync";

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
    let deals: unknown = null;
    let companies: unknown = null;
    try {
      const masterId = resolveCompanyMasterSpreadsheetId();
      if (masterId) {
        // 先に企業マスタへ未登録企業を追記する (案件の追記が企業IDに依存するため)
        const companyRows = await prisma.company.findMany({
          orderBy: { externalId: "asc" },
          select: { externalId: true, name: true, industry: true },
        });
        companies = await appendCompaniesToMaster({
          spreadsheetId: masterId,
          companies: companyRows as CompanyForMaster[],
          apply: true,
        });

        const dealRows = await prisma.deal.findMany({
          orderBy: { id: "asc" },
          select: {
            id: true,
            sheetDealNo: true,
            title: true,
            field: true,
            status: true,
            unitPrice: true,
            acceptedAt: true,
            createdAt: true,
            requiredCount: true,
            recommendedCount: true,
            interviewCount: true,
            offerCount: true,
            contractCount: true,
            company: { select: { externalId: true, name: true } },
            owner: { select: { name: true } },
            partner: { select: { name: true } },
          },
        });
        const mapped: DealForSheet[] = dealRows.map((d) => ({
          id: d.id,
          sheetDealNo: d.sheetDealNo,
          title: d.title,
          field: d.field,
          status: d.status,
          unitPrice: d.unitPrice,
          acceptedAt: d.acceptedAt,
          createdAt: d.createdAt,
          requiredCount: d.requiredCount,
          recommendedCount: d.recommendedCount,
          interviewCount: d.interviewCount,
          offerCount: d.offerCount,
          contractCount: d.contractCount,
          companyExternalId: d.company.externalId,
          companyName: d.company.name,
          ownerName: d.owner?.name ?? null,
          partnerName: d.partner?.name ?? null,
        }));
        const dealResult = await syncDealsToSheet({
          spreadsheetId: masterId,
          deals: mapped,
          apply: true,
        });
        // 割り当てた案件IDを記録して、次回以降ずれない / 二重追記しないようにする
        for (const a of dealResult.assignments) {
          await prisma.deal.update({
            where: { id: a.dealId },
            data: { sheetDealNo: a.sheetDealNo },
          });
        }
        deals = dealResult;
      }
    } catch (e) {
      console.warn("案件・企業のスプシ同期に失敗:", e instanceof Error ? e.message : e);
      deals = { error: e instanceof Error ? e.message : "error" };
    }

    return Response.json({
      ok: true,
      result,
      companyMaster,
      companies,
      deals,
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
