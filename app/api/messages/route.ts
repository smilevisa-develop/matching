import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { getCurrentAccount } from "@/lib/auth";
import { getChatLanguage, loadChatMessages } from "@/lib/chat-messages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await reconcileMessagePersonLinks();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("summary") === "true") {
    // Partner / Person 両方の未読を合算
    const unreadInboundCount = await prisma.message.count({
      where: {
        direction: "inbound",
        readAt: null,
        OR: [{ personId: { not: null } }, { partnerId: { not: null } }],
      },
    });

    return Response.json({ ok: true, unreadInboundCount });
  }

  // 直近 1000 件 (チャット画面はパートナー宛のみ)。ログイン中の担当者の表示言語の訳つき
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

    if (
      (!personId || !Number.isInteger(personId) || personId <= 0) &&
      (!partnerId || !Number.isInteger(partnerId) || partnerId <= 0)
    ) {
      return Response.json(
        { ok: false, error: "personId か partnerId のどちらかを指定してください" },
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
