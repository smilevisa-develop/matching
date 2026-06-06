/**
 * パートナーの担当者 更新 / 削除
 *   PATCH  /api/partners/{id}/contacts/{contactId}  { name?, title?, email?, phone?, notes?, sortOrder? }
 *   DELETE /api/partners/{id}/contacts/{contactId}
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    await requireApiAccount();
    const { id, contactId } = await params;
    const partnerId = Number(id);
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.title !== undefined) data.title = body.title ? String(body.title).trim() : null;
    if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

    // isPrimary を true に切り替える場合は同パートナーの他を全部 false に
    if (body.isPrimary === true) {
      await prisma.partnerContact.updateMany({
        where: { partnerId, NOT: { id: Number(contactId) } },
        data: { isPrimary: false },
      });
      data.isPrimary = true;
    } else if (body.isPrimary === false) {
      data.isPrimary = false;
    }

    const contact = await prisma.partnerContact.update({
      where: { id: Number(contactId) },
      data,
    });
    return Response.json({ ok: true, contact });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    await requireApiAccount();
    const { id, contactId } = await params;
    const partnerId = Number(id);
    const target = await prisma.partnerContact.findUnique({ where: { id: Number(contactId) } });
    await prisma.partnerContact.delete({ where: { id: Number(contactId) } });
    // 主担当を削除した場合、残りの先頭を新しい主担当に昇格
    if (target?.isPrimary) {
      const next = await prisma.partnerContact.findFirst({
        where: { partnerId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await prisma.partnerContact.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
