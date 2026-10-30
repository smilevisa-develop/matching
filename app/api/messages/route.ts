import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { getCurrentAccount } from "@/lib/auth";
import { getChatLanguage, loadChatMessages, loadChatOnlyLineGroups } from "@/lib/chat-messages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await reconcileMessagePersonLinks();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("summary") === "true") {
    // Partner / Person / パートナーではない LINE グループ (内定後のグループなど) の未読を合算
    const groupIds = (await loadChatOnlyLineGroups()).map((g) => g.groupId);
    const unreadInboundCount = await prisma.message.count({
      where: {
        direction: "inbound",
        readAt: null,
        OR: [
          { personId: { not: null } },
          { partnerId: { not: null } },
          ...(groupIds.length > 0 ? [{ partnerId: null, externalId: { in: groupIds } }] : []),
        ],
      },
    });

    return Response.json({ ok: true, unreadInboundCount });
  }

  // 直近 1000 件 (パートナー宛 + パートナーではない LINE グループ)。ログイン中の担当者の表示言語の訳つき
  const account = await getCurrentAccount();
  const lang = await getChatLanguage(account?.id);
  const messages = await loadChatMessages(lang, 1000);
  return Response.json({ ok: true, lang, messages });
}

export async function PATCH(req: Request) {
  try {
    await reconcileMessagePersonLinks();
    const body = await req.json();
    const personId = body?.personId !== undefined ? Number(body.personId) : null;
    const partnerId = body?.partnerId !== undefined ? Number(body.partnerId) : null;
    // パートナーではない LINE グループ (内定後のグループなど) の既読
    const groupId = typeof body?.groupId === "string" && body.groupId ? body.groupId : null;
    if (groupId) {
      const now = new Date();
      const result = await prisma.message.updateMany({
        where: { partnerId: null, externalId: groupId, direction: "inbound", readAt: null },
        data: { readAt: now },
      });
      return Response.json({ ok: true, updatedCount: result.count, readAt: now.toISOString() });
    }

    if (
      (!personId || !Number.isInteger(personId) || personId <= 0) &&
      (!partnerId || !Number.isInteger(partnerId) || partnerId <= 0)
    ) {
      return Response.json(
        { ok: false, error: "personId / partnerId / groupId のどれかを指定してください" },
        { status: 400 }
      );
    }

    const now = new Date();

    const result = await prisma.message.updateMany({
      where: {
        ...(personId ? { personId } : {}),
        ...(partnerId ? { partnerId } : {}),
        direction: "inbound",
        readAt: null,
      },
      data: { readAt: now },
    });

    return Response.json({
      ok: true,
      updatedCount: result.count,
      readAt: now.toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}
