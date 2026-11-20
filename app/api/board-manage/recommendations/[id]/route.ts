/**
 * 案件ボードの管理: 推薦の状況を変える (要ログイン)。パートナーの画面にそのまま出る。
 * PATCH { status, statusNote }
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { BOARD_REC_STATUSES } from "@/lib/board-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = typeof body?.status === "string" ? body.status : "";
    if (!(BOARD_REC_STATUSES as readonly string[]).includes(status)) {
      return Response.json({ ok: false, error: "状況が正しくありません" }, { status: 400 });
    }
    const statusNote = typeof body?.statusNote === "string" ? body.statusNote.trim().slice(0, 500) : "";
    await prisma.boardRecommendation.update({
      where: { id: Number(id) },
      data: { status, statusNote: statusNote || null },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
