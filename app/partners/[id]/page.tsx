import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import PartnerDetailClient, { type PartnerDetailData } from "./PartnerDetailClient";

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCurrentAccount();
  const { id } = await params;
  const partnerId = Number(id);
  if (!Number.isFinite(partnerId)) notFound();

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      deals: {
        select: {
          id: true,
          title: true,
          status: true,
          requiredCount: true,
          recommendedCount: true,
          interviewCount: true,
          offerCount: true,
          contractCount: true,
          declineCount: true,
          rejectCount: true,
          acceptedAt: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      },
      invoices: {
        select: {
          id: true,
          invoiceDate: true,
          invoiceAmount: true,
          invoiceStatus: true,
          dealId: true,
          deal: { select: { title: true, company: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      persons: {
        select: { id: true, name: true, nationality: true, residenceStatus: true, createdAt: true },
        orderBy: { id: "desc" },
        take: 50,
      },
      ratingHistory: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, rating: true, reason: true, recordedBy: true, createdAt: true },
      },
      lineGroups: {
        where: { isActive: true },
        select: { groupId: true, groupName: true, memberCount: true },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
      },
    },
  });
  if (!partner) notFound();

  const data: PartnerDetailData = {
    id: partner.id,
    name: partner.name,
    country: partner.country,
    channel: partner.channel,
    linkStatus: partner.linkStatus,
    contactName: partner.contactName,
    notes: partner.notes,
    rating: partner.rating,
    ratingReason: partner.ratingReason,
    role: partner.role,
    hasPerformance: partner.hasPerformance,
    relationshipStatus: partner.relationshipStatus,
    email: partner.email,
    snsContact: partner.snsContact,
    features: partner.features,
    introducibleNationalities: partner.introducibleNationalities,
    introducibleScope: partner.introducibleScope,
    introducibleFields: partner.introducibleFields,
    introducibleResidenceStatuses: partner.introducibleResidenceStatuses,
    feeAmount: partner.feeAmount,
    minFeeAmount: partner.minFeeAmount,
    feeShareRatio: partner.feeShareRatio,
    lineUserId: partner.lineUserId,
    lineGroupId: partner.lineGroups[0]?.groupId ?? null,
    lineGroupName: partner.lineGroups[0]?.groupName ?? null,
    lineGroupMemberCount: partner.lineGroups[0]?.memberCount ?? null,
    messengerPsid: partner.messengerPsid,
    messengerSubscriptionStatus: partner.messengerSubscriptionStatus,
    messengerSubscriptionFrequency: partner.messengerSubscriptionFrequency,
    messengerSubscribedAt: partner.messengerSubscribedAt?.toISOString() ?? null,
    messengerSubscriptionExpiresAt: partner.messengerSubscriptionExpiresAt?.toISOString() ?? null,
    messengerSubscriptionTopic: partner.messengerSubscriptionTopic,
    whatsappId: partner.whatsappId,
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),
    deals: partner.deals.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      requiredCount: d.requiredCount,
      recommendedCount: d.recommendedCount,
      interviewCount: d.interviewCount,
      offerCount: d.offerCount,
      contractCount: d.contractCount,
      declineCount: d.declineCount,
      rejectCount: d.rejectCount,
      acceptedAt: d.acceptedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      companyId: d.company.id,
      companyName: d.company.name,
    })),
    invoices: partner.invoices.map((inv) => ({
      id: inv.id,
      invoiceDate: inv.invoiceDate?.toISOString() ?? null,
      invoiceAmount: inv.invoiceAmount,
      invoiceStatus: inv.invoiceStatus,
      dealTitle: inv.deal?.title ?? null,
      companyName: inv.deal?.company?.name ?? null,
    })),
    persons: partner.persons.map((p) => ({
      id: p.id,
      name: p.name,
      nationality: p.nationality,
      residenceStatus: p.residenceStatus,
      createdAt: p.createdAt.toISOString(),
    })),
    ratingHistory: partner.ratingHistory.map((h) => ({
      id: h.id,
      rating: h.rating,
      reason: h.reason,
      recordedBy: h.recordedBy,
      createdAt: h.createdAt.toISOString(),
    })),
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/partners" className="text-xs text-[var(--color-primary)] hover:underline">
              ← パートナー一覧
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-[var(--color-text-dark)]">{partner.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              ID #{partner.id} ・ 登録 {new Date(partner.createdAt).toLocaleDateString("ja-JP")}
            </p>
          </div>
        </div>
        <PartnerDetailClient initial={data} />
      </div>
    </div>
  );
}
