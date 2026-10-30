import { prisma } from "@/lib/prisma";
import { isChatLang, type ChatLang } from "@/lib/chat-languages";

/**
 * チャット画面のトーク (会話) の識別子。
 *   p:<partnerId>  パートナーのトーク (LINE グループ / 個人 LINE / Messenger)
 *   g:<groupId>    パートナーではない LINE グループ (内定後のグループなど。LineGroup.chatOnly)
 *
 * 内定後のグループはパートナーに紐づけない。紐づけるとパートナーへの一斉連絡 (/broadcast) の
 * 送信先に入ってしまうため。連絡先紐づけ画面の「パートナーではない」で chatOnly にして、チャットにだけ出す。
 */
export const partnerConvKey = (partnerId: number) => `p:${partnerId}`;
export const groupConvKey = (groupId: string) => `g:${groupId}`;

export function parseConvKey(key: unknown): { partnerId: number } | { groupId: string } | null {
  if (typeof key !== "string") return null;
  if (key.startsWith("p:")) {
    const partnerId = Number(key.slice(2));
    return Number.isInteger(partnerId) && partnerId > 0 ? { partnerId } : null;
  }
  if (key.startsWith("g:") && key.length > 2) return { groupId: key.slice(2) };
  return null;
}

/** Bot が在籍中で「パートナーではない」(チャットのみ) にした LINE グループ */
export async function loadChatOnlyLineGroups() {
  return prisma.lineGroup.findMany({
    where: { isActive: true, partnerId: null, chatOnly: true },
    select: { groupId: true, groupName: true, memberCount: true },
    orderBy: { lastSeenAt: "desc" },
  });
}

/**
 * チャット画面に出すメッセージ (パートナー宛 + パートナーではない LINE グループ) を、
 * 表示言語の訳つきで古い順に返す
 */
export async function loadChatMessages(lang: ChatLang, take: number, chatOnlyGroupIds?: string[]) {
  const groupIds = chatOnlyGroupIds ?? (await loadChatOnlyLineGroups()).map((g) => g.groupId);
  const recent = await prisma.message.findMany({
    where: {
      OR: [
        { partnerId: { not: null } },
        ...(groupIds.length > 0 ? [{ partnerId: null, externalId: { in: groupIds } }] : []),
      ],
    },
    orderBy: { sentAt: "desc" },
    take,
    include: { translations: { where: { lang }, select: { text: true } } },
  });
  return recent.reverse().map((m) => ({
    id: m.id,
    convKey: m.partnerId ? partnerConvKey(m.partnerId) : groupConvKey(m.externalId ?? ""),
    channel: m.channel,
    direction: m.direction,
    content: m.content,
    senderName: m.senderName,
    sentAt: m.sentAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    sourceLang: m.sourceLang,
    translation: m.translations[0]?.text ?? null,
  }));
}

/** ログイン中の担当者の表示言語 (未ログイン・不正値は日本語) */
export async function getChatLanguage(accountId: number | null | undefined): Promise<ChatLang> {
  if (!accountId) return "ja";
  const account = await prisma.staffAccount.findUnique({
    where: { id: accountId },
    select: { chatLanguage: true },
  });
  return isChatLang(account?.chatLanguage) ? account.chatLanguage : "ja";
}
