import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import BroadcastClient from "./BroadcastClient";
import { OPEN_DEAL_STATUSES, dealToBroadcast } from "@/lib/broadcast-variables";

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  await requireCurrentAccount();
  const [partners, templates, groups, openDealsRaw] = await Promise.all([
    prisma.partner.findMany({ orderBy: { name: "asc" } }),
    // 連絡テンプレートは全アカウント共通
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.group.findMany({ include: { members: true }, orderBy: { name: "asc" } }),
    prisma.deal.findMany({
      where: { status: { in: [...OPEN_DEAL_STATUSES] } },
      include: { company: { select: { name: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  const openDeals = openDealsRaw.map(dealToBroadcast).map((d) => ({
    ...d,
    deadline: d.deadline ? d.deadline.toISOString() : null,
  }));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">パートナー一斉連絡</h1>
        <p className="text-sm text-gray-500 mt-1">
          共有の連絡テンプレートを使って、海外パートナーへ一斉連絡します
        </p>
      </div>
      <BroadcastClient
        partners={partners.map((p) => ({
          id: p.id,
          name: p.name,
          country: p.country,
          channel: p.channel,
          linkStatus: p.linkStatus,
          contactName: p.contactName,
          lineUserId: p.lineUserId,
          messengerPsid: p.messengerPsid,
          whatsappId: p.whatsappId,
          relationshipStatus: p.relationshipStatus,
          role: p.role,
          rating: p.rating,
          introducibleNationalities: p.introducibleNationalities,
          introducibleScope: p.introducibleScope,
          introducibleFields: p.introducibleFields,
          introducibleResidenceStatuses: p.introducibleResidenceStatuses,
        }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, content: t.content }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name, memberCount: g.members.length }))}
        openDeals={openDeals}
      />
    </div>
  );
}
