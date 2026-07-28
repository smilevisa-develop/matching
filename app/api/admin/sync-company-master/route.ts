/**
 * 企業マスタ (Google スプレッドシート) を Company に同期 (要管理者)。
 *
 * POST /api/admin/sync-company-master?apply=1   実行 (apply 無しはドライラン)
 *
 * スプシ ID は環境変数 COMPANY_MASTER_SHEET_URL で指定 (未設定なら既定値)。
 * サービスアカウントに当該スプシの閲覧権限を共有しておくこと。
 */

import { AuthError, requireApiAdmin } from "@/lib/auth";
import {
  readCompanyMasterFromSheet,
  resolveCompanyMasterSpreadsheetId,
  upsertCompanyMaster,
} from "@/lib/company-master-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const apply = new URL(req.url).searchParams.get("apply") === "1";

    const spreadsheetId = resolveCompanyMasterSpreadsheetId();
    if (!spreadsheetId) {
      return Response.json({ ok: false, error: "企業マスタのスプシ URL が不正です" }, { status: 400 });
    }

    const master = await readCompanyMasterFromSheet(spreadsheetId);
    const result = await upsertCompanyMaster(master, apply);

    return Response.json({ ok: true, apply, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
