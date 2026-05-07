import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const dealId = Number(id);
    if (!Number.isFinite(dealId)) {
      return Response.json({ ok: false, error: "dealId が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const conditions = body?.conditions;
    if (typeof conditions !== "object" || conditions === null) {
      return Response.json({ ok: false, error: "conditions が必要です" }, { status: 400 });
    }
    // 文字列値だけを受け入れる (空文字は null 扱い)
    const cleaned: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(conditions as Record<string, unknown>)) {
      if (typeof v === "string") {
        const trimmed = v.trim();
        cleaned[k] = trimmed === "" ? null : trimmed;
      } else if (v === null) {
        cleaned[k] = null;
      }
    }
    const deal = await prisma.deal.update({
      where: { id: dealId },
      data: { conditions: cleaned },
      select: { id: true, conditions: true },
    });
    return Response.json({ ok: true, conditions: deal.conditions });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
