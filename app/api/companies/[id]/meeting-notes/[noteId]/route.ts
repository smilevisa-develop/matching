/**
 * DELETE /api/companies/[id]/meeting-notes/[noteId]
 * 企業名が似ていて別の会社の議事録が入ったときに外す (要ログイン)。スプシの行は消さない。
 * 消さずに「外した」印を付けるので、もう一度「探す」を押しても入り直さない。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    await requireApiAccount();
    const { id, noteId } = await ctx.params;
    const { count } = await prisma.meetingNote.updateMany({
      where: { id: Number(noteId), companyId: Number(id), dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    if (count === 0) return Response.json({ ok: false, error: "議事録が見つかりません" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    console.error("meeting-notes delete:", error);
    return Response.json({ ok: false, error: "議事録を外せませんでした" }, { status: 500 });
  }
}
