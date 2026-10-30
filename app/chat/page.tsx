import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { requireCurrentAccount } from "@/lib/auth";
import { getChatLanguage, loadChatMessages } from "@/lib/chat-messages";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const account = await requireCurrentAccount();
  await reconcileMessagePersonLinks();

  // 連絡先 ID (LINE グループ / 個人 LINE / Messenger / WhatsApp) のいずれかが
  // 紐づいているパートナーを取得
  const partners = await prisma.partner.findMany({
    where: {
      OR: [
        { lineGroups: { some: { isActive: true } } },
        { lineUserId: { not: null } },
        { messengerPsid: { not: null } },
        { whatsappId: { not: null } },
      ],
    },
    include: {
      lineGroups: {
        where: { isActive: true },
        select: { groupId: true, groupName: true, memberCount: true },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  // 直近 500 件 (古い順)。担当者の表示言語の訳つき
  const lang = await getChatLanguage(account.id);
  const messages = await loadChatMessages(lang, 500);

  // ピン留めは担当者ごと
  const pins = await prisma.chatPin.findMany({ where: { accountId: account.id }, select: { partnerId: true } });

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
        lineGroupId: p.lineGroups[0]?.groupId ?? null,
        lineGroupName: p.lineGroups[0]?.groupName ?? null,
        lineGroupMemberCount: p.lineGroups[0]?.memberCount ?? null,
        messengerPsid: p.messengerPsid,
        whatsappId: p.whatsappId,
      }))}
      initialMessages={messages}
      initialLang={lang}
      initialPinnedIds={pins.map((p) => p.partnerId)}
      templates={templates.map((t) => ({ id: t.id, name: t.name, content: t.content }))}
    />
  );
}
