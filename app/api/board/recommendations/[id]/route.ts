/**
 * 案件ボード: パートナーが自分の推薦を取り下げる (まだ「受付」のものだけ)。
 * DELETE /api/board/recommendations/{id}  → 状況を「取り下げ」にする (記録は残す)
 */

import { prisma } from "@/lib/prisma";
import { getBoardPartner } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const partner = await getBoardPartner();
  if (!partner) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const recId = Number(id);
  if (!Number.isInteger(recId)) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const result = await prisma.boardRecommendation.updateMany({
    where: { id: recId, partnerId: partner.id, status: "受付" },
    data: { status: "取り下げ" },
  });
  if (result.count === 0) {
    return Response.json({ ok: false, error: "取り下げられませんでした / Cannot withdraw." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
