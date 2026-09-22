/**
 * 企業データベース (スプシの「企業マスタ」「案件管理」) への反映を実行する。
 *
 * 呼び出し元:
 *   - 企業・案件を作成/更新した API (after() で保存直後に走らせる)
 *   - 毎時の cron (/api/cron/sync-sheet) … 取りこぼしの保険
 *
 * 以前は cron だけで反映していたが、GitHub Actions の schedule は実際には
 * 数時間おきにしか動かず、「追加したのに反映されない」状態が続いた。
 * そこで保存した瞬間にも反映するようにした。
 *
 * 連続で保存されても (人数カウンターの連打など) 同時に何本も走らないよう、
 * プロセス内で 1 本に直列化し、実行中に来た依頼は 1 回の再実行にまとめる。
 */

import { prisma } from "@/lib/prisma";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import {
  appendCompaniesToMaster,
  syncDealsToSheet,
  type CompanyForMaster,
  type DealForSheet,
  type DealSyncResult,
  type MasterSyncResult,
} from "@/lib/deal-sheet-sync";

export type CompanyDbSyncResult = {
  companies: MasterSyncResult | null;
  deals: DealSyncResult | null;
  error: string | null;
};

/** 1 回分の同期 (企業マスタへの追記 → 案件管理への差分同期) */
export async function runCompanyDatabaseSync(): Promise<CompanyDbSyncResult> {
  const masterId = resolveCompanyMasterSpreadsheetId();
  if (!masterId) return { companies: null, deals: null, error: "企業データベースのスプシIDが未設定" };

  try {
    // 先に企業マスタへ未登録企業を追記する (案件管理の企業ID(C列)は企業マスタを引くため)
    const companyRows = await prisma.company.findMany({
      orderBy: { externalId: "asc" },
      select: { externalId: true, name: true, industry: true },
    });
    const companies = await appendCompaniesToMaster({
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
        company: { select: { externalId: true, name: true, industry: true } },
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
      companyIndustry: d.company.industry,
      ownerName: d.owner?.name ?? null,
      partnerName: d.partner?.name ?? null,
    }));
    const deals = await syncDealsToSheet({ spreadsheetId: masterId, deals: mapped, apply: true });

    // 割り当てた案件IDを記録して、次回以降ずれない / 二重追記しないようにする
    for (const a of deals.assignments) {
      await prisma.deal.update({ where: { id: a.dealId }, data: { sheetDealNo: a.sheetDealNo } });
    }
    // 引き取った行のスプシ実績を系へ取り込む (系が未入力 0 だった人数)
    for (const pb of deals.pullbacks) {
      await prisma.deal.update({ where: { id: pb.dealId }, data: { [pb.field]: pb.value } });
    }
    return { companies, deals, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : "error";
    console.warn("企業データベースへの同期に失敗:", error);
    return { companies: null, deals: null, error };
  }
}

let running: Promise<CompanyDbSyncResult> | null = null;
let rerunRequested = false;

/**
 * 同期を依頼する。実行中なら終わったあとにもう 1 回だけ走らせる
 * (その間に何回依頼が来ても 1 回にまとめる)。
 */
export function requestCompanyDatabaseSync(): Promise<CompanyDbSyncResult> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    let last: CompanyDbSyncResult;
    do {
      rerunRequested = false;
      last = await runCompanyDatabaseSync();
    } while (rerunRequested);
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * 企業IDが空欄のまま作られた企業に付ける ID を決める ("NNsv" の次の空き番号)。
 * 企業IDが無い企業はスプシの企業マスタに載せられず、案件も反映できないため。
 */
export async function nextCompanyExternalId(): Promise<string> {
  const rows = await prisma.company.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = String(r.externalId).match(/^(\d{1,3})[a-z]{1,3}$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${String(max + 1).padStart(2, "0")}sv`;
}
