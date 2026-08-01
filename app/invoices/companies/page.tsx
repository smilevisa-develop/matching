import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import CompanyInvoicesClient from "../CompanyInvoicesClient";

export const dynamic = "force-dynamic";

export default async function CompanyInvoicesPage() {
  await requireCurrentAccount();
  const invoices = await prisma.invoice.findMany({
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    include: {
      person: { select: { id: true, name: true } },
      deal: {
        select: {
          id: true,
          title: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">企業への請求</h1>
        <p className="mt-1 text-sm text-gray-500">
          求人に紐づく企業へ発行する請求書を管理します。行の企業名をクリックすると企業詳細に移動します。
        </p>
      </div>

      <CompanyInvoicesClient
        invoices={invoices.map((invoice) => ({
          id: invoice.id,
          personId: invoice.person?.id ?? null,
          personName: invoice.person?.name ?? null,
          dealId: invoice.deal?.id ?? null,
          dealTitle: invoice.deal?.title ?? null,
          companyId: invoice.deal?.company?.id ?? null,
          companyName: invoice.deal?.company?.name ?? null,
          invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
          invoiceAmount: invoice.invoiceAmount,
          invoiceStatus: invoice.invoiceStatus,
          invoiceUrl: invoice.invoiceUrl,
          createdAt: invoice.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
