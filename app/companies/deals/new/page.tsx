import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import NewDealClient from "./NewDealClient";

export const dynamic = "force-dynamic";

export default async function NewDealPage() {
  await requireCurrentAccount();
  const [companies, accounts] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.staffAccount.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">求人を追加</h1>
          <p className="mt-2 text-sm text-gray-500">企業ごとに求人を作成し、担当者や単価、期限を設定します。紹介パートナーは候補者ごとに管理します。</p>
        </div>
        <NewDealClient
          companies={companies.map((company) => ({ id: company.id, name: company.name }))}
          accounts={accounts}
        />
      </div>
    </div>
  );
}
