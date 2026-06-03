import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import LinkPageClient from "./LinkPageClient";

export const dynamic = "force-dynamic";

export default async function PartnerLinkPage() {
  await requireCurrentAccount();
  const [partners, lineProfiles, messengerProfiles, lineGroups] = await Promise.all([
    prisma.partner.findMany({ orderBy: { name: "asc" } }),
    prisma.lineProfile.findMany({ orderBy: { lastSeenAt: "desc" }, take: 50 }),
    prisma.messengerProfile.findMany({ orderBy: { lastSeenAt: "desc" }, take: 50 }),
    prisma.lineGroup.findMany({
      where: { isActive: true },
      orderBy: { lastSeenAt: "desc" },
      include: { partner: { select: { id: true, name: true } } },
    }),
  ]);

  const linkedLineIds = new Set(partners.map((p) => p.lineUserId).filter(Boolean) as string[]);
  const linkedPsids = new Set(partners.map((p) => p.messengerPsid).filter(Boolean) as string[]);

  const unlinkedLine = lineProfiles.filter((p) => !linkedLineIds.has(p.lineUserId));
  const unlinkedMessenger = messengerProfiles.filter((p) => !linkedPsids.has(p.psid));
  const unlinkedLineGroups = lineGroups.filter((g) => !g.partnerId);
  const linkedLineGroups = lineGroups.filter((g) => g.partnerId);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">連絡先紐づけ</h1>
        <p className="mt-1 text-sm text-gray-500">
          パートナー会社の LINE グループ / 個人 LINE / Messenger を紐づけます。
          配信時はパートナーに紐づいた LINE グループへ自動送信されます (グループが無ければ個人 LINE)。
        </p>
      </div>

      <LinkPageClient
        partners={partners.map((p) => ({ id: p.id, name: p.name }))}
        unlinkedLineGroups={unlinkedLineGroups.map((g) => ({
          id: g.id,
          groupId: g.groupId,
          groupName: g.groupName,
          memberCount: g.memberCount,
          lastMessageText: g.lastMessageText,
          lastSeenAt: g.lastSeenAt.toISOString(),
        }))}
        linkedLineGroups={linkedLineGroups.map((g) => ({
          id: g.id,
          groupId: g.groupId,
          groupName: g.groupName,
          memberCount: g.memberCount,
          partnerName: g.partner?.name ?? null,
        }))}
        unlinkedLine={unlinkedLine.map((p) => ({
          lineUserId: p.lineUserId,
          displayName: p.displayName,
          lastMessageText: p.lastMessageText,
          lastSeenAt: p.lastSeenAt.toISOString(),
        }))}
        unlinkedMessenger={unlinkedMessenger.map((p) => ({
          psid: p.psid,
          lastMessageText: p.lastMessageText,
          lastSeenAt: p.lastSeenAt.toISOString(),
        }))}
      />
    </div>
  );
}
