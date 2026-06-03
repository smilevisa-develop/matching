/**
 * LINE グループの紐づけ / 解除 / 削除。
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireApiAccount();
    const { groupId } = await params;
    const body = (await req.json()) as { partnerId?: number | null; groupName?: string | null };

    const updated = await prisma.lineGroup.update({
      where: { groupId },
      data: {
        partnerId:
          body.partnerId === null || body.partnerId === undefined
            ? null
            : Number(body.partnerId),
        ...(body.groupName !== undefined ? { groupName: body.groupName } : {}),
      },
    });
    return Response.json({ ok: true, group: updated });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireApiAccount();
    const { groupId } = await params;
    await prisma.lineGroup.delete({ where: { groupId } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
