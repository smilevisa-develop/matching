/**
 * カンバンで入れたステージの日付を、企業データベース (請求管理 / 内定者管理) に書き直す (要ログイン)。
 * 自動反映が失敗した人の取り直しと、失敗理由の確認に使う。
 *
 * POST /api/admin/stage-date-sheet  { personId: number }
 *   その候補者の最新のカンバン (DealCandidate) の stageDates を、スプシのセルが空のところだけ書く
 *   (手入力の実際の日付は消さない)。1 件ずつ結果 (書いた場所 / スキップ理由 / エラー) を返す
 * POST /api/admin/stage-date-sheet  { fix: [{ tab, cell, value }] }
 *   日付セルを直接直す (請求管理 M/N、内定者管理 J/K だけ)
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { readStageDates } from "@/lib/deal-stages";
import { setStageDateCell, writeStageDateToSheet } from "@/lib/candidate-date-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.fix)) {
      const fixed = [];
      for (const f of body.fix as { tab: string; cell: string; value: string }[]) {
        await setStageDateCell({ tab: String(f.tab), cell: String(f.cell), value: String(f.value ?? "") });
        fixed.push(f);
      }
      return Response.json({ ok: true, fixed });
    }
    const personId = Number(body?.personId);
    if (!Number.isInteger(personId) || personId <= 0) {
      return Response.json({ ok: false, error: "personId を指定してください" }, { status: 400 });
    }
    const dc = await prisma.dealCandidate.findFirst({
      where: { personId },
      orderBy: { updatedAt: "desc" },
      select: { stageDates: true },
    });
    const dates = readStageDates(dc?.stageDates);
    const results: { stage: string; date: string; result: unknown }[] = [];
    for (const [stage, date] of Object.entries(dates)) {
      try {
        results.push({ stage, date, result: await writeStageDateToSheet({ personId, stage, date, onlyIfEmpty: true }) });
      } catch (e) {
        results.push({ stage, date, result: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      }
    }
    return Response.json({ ok: true, personId, results });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
