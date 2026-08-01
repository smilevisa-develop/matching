/**
 * 母国語チェックリストの追跡 (公開・token 認証、未ログイン可)。
 *
 * POST /api/checklist/[token]
 *   body: { action: "open" }                       → 開封を記録 (openedAt)
 *   body: { action: "check", checkedItems: {...} }  → チェック状況を保存
 *          checkedItems の全項目が true なら completedAt を記録
 */

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "無効なリンクです" }, { status: 400 });
    }
    const delivery = await prisma.jobChecklistDelivery.findUnique({
      where: { token },
      select: { id: true, items: true, openedAt: true },
    });
    if (!delivery) {
      return Response.json({ ok: false, error: "リンクが無効です" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "open") {
      if (!delivery.openedAt) {
        await prisma.jobChecklistDelivery.update({
          where: { id: delivery.id },
          data: { openedAt: new Date() },
        });
      }
      return Response.json({ ok: true });
    }

    if (action === "check") {
      const checked =
        body?.checkedItems && typeof body.checkedItems === "object"
          ? (body.checkedItems as Record<string, unknown>)
          : {};
      const checkedItems: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(checked)) checkedItems[k] = v === true;

      // 全項目チェック済みか判定
      const items = Array.isArray(delivery.items) ? (delivery.items as { key?: string }[]) : [];
      const allChecked =
        items.length > 0 && items.every((i) => i?.key && checkedItems[i.key] === true);

      await prisma.jobChecklistDelivery.update({
        where: { id: delivery.id },
        data: {
          checkedItems,
          openedAt: delivery.openedAt ?? new Date(),
          completedAt: allChecked ? new Date() : null,
        },
      });
      return Response.json({ ok: true, completed: allChecked });
    }

    return Response.json({ ok: false, error: "action が不正です" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
