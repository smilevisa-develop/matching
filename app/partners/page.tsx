import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import SharedPartnersClient from "./SharedPartnersClient";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  await requireCurrentAccount();
  const partners = await prisma.partner.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { deals: true, persons: true } },
    },
  });

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">パートナーリスト</h1>
          <p className="mt-1 text-sm text-gray-500">
            海外紹介パートナーの情報は全アカウント共通です。行をクリックすると詳細を編集できます。
          </p>
        </div>
        <Link
          href="/partners/new"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + パートナーを追加
        </Link>
      </div>
      <SharedPartnersClient
        initialPartners={partners.map((p) => ({
          id: p.id,
          name: p.name,
          country: p.country,
          channel: p.channel,
          linkStatus: p.linkStatus,
          contactName: p.contactName,
          rating: p.rating,
          role: p.role,
          hasPerformance: p.hasPerformance,
          introducibleNationalities: p.introducibleNationalities,
          dealCount: p._count.deals,
          personCount: p._count.persons,
        }))}
      />
    </div>
  );
}
