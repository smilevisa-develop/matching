/**
 * パートナーごとのアンケートのリンクを返す (要ログイン)。個別に送るときに使う。
 *   GET /api/partners/{id}/survey-link → { ok, url }
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensureSurveyUrl } from "@/lib/partner-survey-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    if (!Number.isFinite(partnerId)) return Response.json({ ok: false, error: "id が不正です" }, { status: 400 });
    return Response.json({ ok: true, url: await ensureSurveyUrl(partnerId) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
