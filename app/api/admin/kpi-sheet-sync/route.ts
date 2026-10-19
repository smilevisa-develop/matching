/**
 * 人材紹介KPI シート (自動転記タブ) への転記を手で確認・実行する (要ログイン)。
 *
 * GET  /api/admin/kpi-sheet-sync?month=2026-10   どのセルに何を書くかを返すだけ (書かない)
 * POST /api/admin/kpi-sheet-sync  { month?: "2026-10" }   実際に書く (省略時は今月)
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { syncKpiSheet } from "@/lib/kpi-sheet-sync";
import { currentMonthJst, isMonthKey } from "@/lib/month-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const m = new URL(req.url).searchParams.get("month");
    const month = isMonthKey(m) ? m : currentMonthJst();
    return Response.json({ ok: true, ...(await syncKpiSheet({ month, apply: false })) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const month = isMonthKey(body?.month) ? body.month : currentMonthJst();
    return Response.json({ ok: true, ...(await syncKpiSheet({ month, apply: true })) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
