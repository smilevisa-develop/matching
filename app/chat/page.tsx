import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import { requireCurrentAccount } from "@/lib/auth";
import {
  getChatLanguage,
  groupConvKey,
  loadChatMessages,
  loadChatOnlyLineGroups,
  partnerConvKey,
} from "@/lib/chat-messages";
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

  // パートナーではない LINE グループ (内定後のグループなど。連絡先紐づけ画面で「パートナーではない」にしたもの)。
  // パートナーに紐づけると一斉連絡の送信先に入るので、紐づけないままチャットにだけ出す
  const groups = await loadChatOnlyLineGroups();

  // 直近 1000 件 (古い順)。担当者の表示言語の訳つき
  const lang = await getChatLanguage(account.id);
  const messages = await loadChatMessages(lang, 1000, groups.map((g) => g.groupId));

  // ピン留めは担当者ごと
  const pins = await prisma.chatPin.findMany({
    where: { accountId: account.id },
    select: { partnerId: true, lineGroupId: true },
  });

  // メッセージテンプレートは全アカウント共通
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <ChatClient
      conversations={[
        ...partners.map((p) => ({
          id: partnerConvKey(p.id),
          kind: "partner" as const,
          partnerId: p.id,
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
        })),
        ...groups.map((g) => ({
          id: groupConvKey(g.groupId),
          kind: "group" as const,
          partnerId: null,
          name: g.groupName ?? "LINE グループ",
          country: null,
          channel: "LINE-Group",
          contactName: null,
          lineUserId: null,
          lineGroupId: g.groupId,
          lineGroupName: g.groupName,
          lineGroupMemberCount: g.memberCount,
          messengerPsid: null,
          whatsappId: null,
        })),
      ]}
      initialMessages={messages}
      initialLang={lang}
      initialPinnedKeys={pins.flatMap((p) =>
        p.partnerId ? [partnerConvKey(p.partnerId)] : p.lineGroupId ? [groupConvKey(p.lineGroupId)] : [],
      )}
      templates={templates.map((t) => ({ id: t.id, name: t.name, content: t.content }))}
    />
  );
}
