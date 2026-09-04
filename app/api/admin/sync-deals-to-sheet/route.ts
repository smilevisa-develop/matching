/**
 * 系の案件・企業を 企業データベース (スプシ) へ差分同期する admin エンドポイント。
 *
 * GET /api/admin/sync-deals-to-sheet            ← ドライラン (何を更新/追記するか返すだけ)
 * GET /api/admin/sync-deals-to-sheet?apply=1    ← 本実行
 * GET /api/admin/sync-deals-to-sheet?target=deals|companies|all   ← 対象を絞る (既定 all)
 *
 * 安全のため:
 *   - 案件ID が一致しても 企業ID が食い違う行は触らず conflicts に出す
 *   - 企業マスタは「マスタが正」なので既存行は書き換えず、未登録企業の追記だけ行う
 * 詳細は lib/deal-sheet-sync.ts のヘッダコメントを参照。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import {
  appendCompaniesToMaster,
  syncDealsToSheet,
  type CompanyForMaster,
  type DealForSheet,
} from "@/lib/deal-sheet-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const apply = searchParams.get("apply") === "1";
    const target = searchParams.get("target") ?? "all";

    const spreadsheetId = resolveCompanyMasterSpreadsheetId();
    if (!spreadsheetId) {
      return Response.json(
        { ok: false, error: "企業データベースのスプレッドシート ID を解決できません" },
        { status: 500 },
      );
    }

    const out: Record<string, unknown> = { ok: true, apply, spreadsheetId };

    // ── 企業マスタ (先に流す。案件追記が企業IDに依存するため) ──
    if (target === "all" || target === "companies") {
      const companies = await prisma.company.findMany({
        orderBy: { externalId: "asc" },
        select: { externalId: true, name: true, industry: true },
      });
      out.companies = await appendCompaniesToMaster({
        spreadsheetId,
        companies: companies as CompanyForMaster[],
        apply,
      });
    }

    // ── 案件情報 ──
    if (target === "all" || target === "deals") {
      const deals = await prisma.deal.findMany({
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
      const mapped: DealForSheet[] = deals.map((d) => ({
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
      const dealResult = await syncDealsToSheet({ spreadsheetId, deals: mapped, apply });
      // 実行時のみ、割り当てた案件IDを系に記録する (次回から番号がずれない)
      if (apply && dealResult.assignments.length > 0) {
        for (const a of dealResult.assignments) {
          await prisma.deal.update({
            where: { id: a.dealId },
            data: { sheetDealNo: a.sheetDealNo },
          });
        }
      }
      out.deals = dealResult;
    }

    return Response.json(out);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
