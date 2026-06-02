import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { requireCurrentAccount } from "@/lib/auth";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requireCurrentAccount();
  await reconcileMessagePersonLinks();

  const partners = await prisma.partner.findMany({
    where: {
      OR: [
        { lineUserId: { not: null } },
        { messengerPsid: { not: null } },
      ],
    },
    orderBy: { name: "asc" },
  });

  const messages = await prisma.message.findMany({
    where: { partnerId: { not: null } },
    orderBy: { sentAt: "asc" },
    take: 500,
  });

  // メッセージテンプレートは全アカウント共通
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <ChatClient
      partners={partners.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        channel: p.channel,
        contactName: p.contactName,
        lineUserId: p.lineUserId,
        messengerPsid: p.messengerPsid,
        whatsappId: p.whatsappId,
      }))}
      initialMessages={messages.map((m) => ({
        id: m.id,
        partnerId: m.partnerId,
        channel: m.channel,
        direction: m.direction,
        content: m.content,
        sentAt: m.sentAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      }))}
      templates={templates.map((t) => ({ id: t.id, name: t.name, content: t.content }))}
    />
  );
}
