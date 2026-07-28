/**
 * 推薦先企業の手動上書き (要ログイン)。
 *
 * POST /api/personnel/[id]/recommended-company
 *   body: { value: string }   空文字なら手動上書きを解除 (案件から自動導出に戻す)
 *
 * ここで保存した値は Person.recommendedCompany に入り、スプシ「推薦先企業」へ
 * 優先反映される (空なら案件 DealCandidate から導出)。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.value === "string" ? body.value.trim() : "";
    const value = raw.length > 0 ? raw : null;

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    await prisma.person.update({
      where: { id: personId },
      data: { recommendedCompany: value },
    });
    return Response.json({ ok: true, recommendedCompany: value });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
