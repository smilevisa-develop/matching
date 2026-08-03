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

    const nextPartnerId =
      body.partnerId === null || body.partnerId === undefined ? null : Number(body.partnerId);

    const updated = await prisma.lineGroup.update({
      where: { groupId },
      data: {
        partnerId: nextPartnerId,
        ...(body.groupName !== undefined ? { groupName: body.groupName } : {}),
      },
    });

    // グループを紐づけたら、そのパートナーの連絡手段に LINE を自動で ON にする
    // (既存の選択は保持しつつ union で追加)
    if (nextPartnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: nextPartnerId },
        select: { preferredChannels: true },
      });
      const channelSet = new Set(
        (partner?.preferredChannels ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (!channelSet.has("LINE")) {
        channelSet.add("LINE");
        await prisma.partner.update({
          where: { id: nextPartnerId },
          data: { preferredChannels: [...channelSet].join(","), linkStatus: "完了" },
        });
      }
    }

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
