import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { normalizeDealStatus } from "@/lib/deal-stages";

export const dynamic = "force-dynamic";

/**
 * 企業を開いたら、その企業の求人ワークスペース (条件・求人票・候補者) へ直行する。
 * 「企業→求人カード→ワークスペース」の階層を廃止し、1 企業 = 1 求人で運用。
 * 求人が無ければ自動作成する。
 */
export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentAccount();
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isFinite(companyId)) notFound();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      hiringStatus: true,
      deals: { select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!company) notFound();

  let dealId = company.deals[0]?.id;
  if (!dealId) {
    // 求人がまだ無ければ 1 件作成 (タイトルは企業名、ステータスは企業追加時に選んだ採用状況)
    const created = await prisma.deal.create({
      data: { title: company.name, companyId, status: normalizeDealStatus(company.hiringStatus) },
      select: { id: true },
    });
    dealId = created.id;
  }

  redirect(`/companies/deals/${dealId}`);
}
