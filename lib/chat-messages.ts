import { prisma } from "@/lib/prisma";
import { isChatLang, type ChatLang } from "@/lib/chat-languages";

/** チャット画面に出すメッセージ (パートナー宛のみ) を、表示言語の訳つきで古い順に返す */
export async function loadChatMessages(lang: ChatLang, take: number) {
  const recent = await prisma.message.findMany({
    where: { partnerId: { not: null } },
    orderBy: { sentAt: "desc" },
    take,
    include: { translations: { where: { lang }, select: { text: true } } },
  });
  return recent.reverse().map((m) => ({
    id: m.id,
    partnerId: m.partnerId,
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
