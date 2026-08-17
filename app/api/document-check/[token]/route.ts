/**
 * 事前確認資料の追跡 (公開・token 認証、未ログイン可)。
 *
 * POST /api/document-check/[token]
 *   body: { action: "open" }
 *     → 開封を記録 (openedAt)
 *   body: { action: "save", checkedItems: {...}, unclearItems: {...} }
 *     → 「確認しました」と「わからない」を保存。
 *        チェック対象 (kind: "check") が全部チェック済みなら completedAt を記録。
 *
 * 「わからない」は、面談で説明すべき箇所を担当者に知らせるための印。
 * チェックと排他ではなく、両方付いていても構わない (読んだが自信が無い状態)。
 */

import { prisma } from "@/lib/prisma";
import { parseDeliveryItems } from "@/lib/company-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** { key: true } 形式に正規化する */
function toFlagMap(value: unknown): Record<string, boolean> {
  const src = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === true) out[k] = true;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return Response.json({ ok: false, error: "無効なリンクです" }, { status: 400 });
    }
    const delivery = await prisma.companyDocumentDelivery.findUnique({
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
        await prisma.companyDocumentDelivery.update({
          where: { id: delivery.id },
          data: { openedAt: new Date() },
        });
      }
      return Response.json({ ok: true });
    }

    if (action === "save") {
      const checkedItems = toFlagMap(body?.checkedItems);
      const unclearItems = toFlagMap(body?.unclearItems);

      // 完了判定は「チェックが必要なセクション」だけで見る。
      // 会社の考え方 (kind: "read") は読むだけなので対象外。
      const items = parseDeliveryItems(delivery.items);
      const targets = items.filter((i) => i.kind === "check");
      const allChecked = targets.length > 0 && targets.every((i) => checkedItems[i.key] === true);

      await prisma.companyDocumentDelivery.update({
        where: { id: delivery.id },
        data: {
          checkedItems,
          unclearItems,
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
