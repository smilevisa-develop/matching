import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { getCoreSettings } from "@/lib/app-settings";
import { TEST_COMPANY_EXTERNAL_IDS } from "@/lib/test-companies";
import RevenueDashboard from "./RevenueDashboard";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  await requireCurrentAccount();
  const coreSettings = await getCoreSettings();
  const [deals, invoices] = await Promise.all([
    prisma.deal.findMany({
      // テスト企業は集計に含めない
      // (notIn だけだと企業IDが空の企業まで外れるので、空は明示的に含める)
      where: { NOT: { company: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } },
      select: {
        id: true,
        title: true,
        acceptedAt: true,
        createdAt: true,
        requiredCount: true,
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        contractCount: true,
        company: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      // テスト企業の求人に紐づく請求は集計に含めない
      where: { NOT: { deal: { company: { externalId: { in: TEST_COMPANY_EXTERNAL_IDS } } } } },
      select: {
        id: true,
        invoiceDate: true,
        invoiceAmount: true,
        costAmount: true,
        channel: true,
        invoiceStatus: true,
        createdAt: true,
        dealId: true,
        deal: { select: { title: true, company: { select: { name: true } } } },
        person: { select: { id: true, name: true } },
      },
      orderBy: { invoiceDate: "desc" },
    }),
  ]);

  return (
    <RevenueDashboard
      initialDeals={deals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        companyName: deal.company.name,
        acceptedAt: deal.acceptedAt?.toISOString() ?? null,
        createdAt: deal.createdAt.toISOString(),
        requiredCount: deal.requiredCount,
        recommendedCount: deal.recommendedCount,
        interviewCount: deal.interviewCount,
        offerCount: deal.offerCount,
        contractCount: deal.contractCount,
      }))}
      initialInvoices={invoices.map((invoice) => ({
        id: invoice.id,
        invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
        invoiceAmount: invoice.invoiceAmount,
        costAmount: invoice.costAmount,
        channel: invoice.channel,
        invoiceStatus: invoice.invoiceStatus,
        dealTitle: invoice.deal?.title ?? null,
        companyName: invoice.deal?.company?.name ?? null,
        personName: invoice.person?.name ?? null,
      }))}
      monthlyOfferTarget={coreSettings.monthlyOfferTarget}
      monthlyRevenueTarget={coreSettings.monthlyRevenueTarget}
      monthlyTargets={coreSettings.monthlyTargets}
    />
  );
}
