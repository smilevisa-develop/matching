import { prisma } from "@/lib/prisma";

/**
 * 受信メッセージを Person/Partner に紐づけ直す。
 * Person/Partner.lineUserId or messengerPsid と Message.externalId をマッチ。
 * Partner マッチを優先 (B2B 連絡用途を主とするため)。
 */
export async function reconcileMessagePersonLinks() {
  const orphanMessages = await prisma.message.findMany({
    where: {
      personId: null,
      partnerId: null,
      externalId: { not: null },
    },
    select: {
      id: true,
      channel: true,
      externalId: true,
    },
    take: 500,
  });

  if (orphanMessages.length === 0) {
    return 0;
  }

  // Partner 側
  const partners = await prisma.partner.findMany({
    where: {
      OR: [{ lineUserId: { not: null } }, { messengerPsid: { not: null } }],
    },
    select: { id: true, lineUserId: true, messengerPsid: true },
  });
  const partnerLineMap = new Map(
    partners.filter((p) => p.lineUserId).map((p) => [p.lineUserId as string, p.id])
  );
  const partnerMessengerMap = new Map(
    partners.filter((p) => p.messengerPsid).map((p) => [p.messengerPsid as string, p.id])
  );

  // Person 側 (フォールバック)
  const persons = await prisma.person.findMany({
    where: {
      OR: [{ lineUserId: { not: null } }, { messengerPsid: { not: null } }],
    },
    select: { id: true, lineUserId: true, messengerPsid: true },
  });
  const personLineMap = new Map(
    persons.filter((p) => p.lineUserId).map((p) => [p.lineUserId as string, p.id])
  );
  const personMessengerMap = new Map(
    persons.filter((p) => p.messengerPsid).map((p) => [p.messengerPsid as string, p.id])
  );

  const updates = orphanMessages
    .map((message) => {
      const externalId = message.externalId;
      if (!externalId) return null;

      // Partner 優先
      const partnerId =
        message.channel === "Messenger"
          ? partnerMessengerMap.get(externalId)
          : partnerLineMap.get(externalId);
      if (partnerId) {
        return prisma.message.update({
          where: { id: message.id },
          data: { partnerId },
        });
      }
      // Person フォールバック
      const personId =
        message.channel === "Messenger"
          ? personMessengerMap.get(externalId)
          : personLineMap.get(externalId);
      if (personId) {
        return prisma.message.update({
          where: { id: message.id },
          data: { personId },
        });
      }
      return null;
    })
    .filter((update): update is ReturnType<typeof prisma.message.update> => update !== null);

  if (updates.length === 0) {
    return 0;
  }

  await prisma.$transaction(updates);
  return updates.length;
}
