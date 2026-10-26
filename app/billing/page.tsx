import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { currentMonthJst, isMonthKey, monthRangeJst, shiftMonth } from "@/lib/month-stats";
import { BILLING_STEPS, accountingOwnerName } from "@/lib/billing-flow";
import BillingClient, { type BillingTaskRow } from "./BillingClient";

export const dynamic = "force-dynamic";

/**
 * 請求管理 (月ごとのやること)。
 * 内定者管理の「請求」の列に入れた人について、入社日から作った請求のタスク (lib/billing-flow.ts) を月ごとに並べる。
 *   企業へ請求書を送る (入社の翌月 1 日) → 入金確認 (その月末) → パートナーへ依頼・受け取り → パートナーへ支払い (入金の翌月末)
 * 期限がその月のタスクと、前の月から残っているタスクを出す。終えたら企業データベースの請求管理にも書く。
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireCurrentAccount();
  const { month: requested } = await searchParams;
  const thisMonth = currentMonthJst();
  const month = isMonthKey(requested) ? requested : thisMonth;
  const range = monthRangeJst(month);

  const [tasks, staff, settings, ownerName] = await Promise.all([
    prisma.placementTask.findMany({
      where: {
        billingStep: { not: null },
        OR: [{ dueAt: range }, { dueAt: { lt: range.gte }, doneAt: null }],
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        billingStep: true,
        dueAt: true,
        doneAt: true,
        doneBy: true,
        owner: true,
        placement: {
          select: {
            id: true,
            externalName: true,
            externalCompanyName: true,
            joinAt: true,
            person: {
              select: {
                id: true,
                name: true,
                onboarding: { select: { englishName: true } },
                partner: { select: { name: true } },
                dealCandidates: { orderBy: { updatedAt: "desc" }, take: 1, select: { deal: { select: { company: { select: { name: true } } } } } },
              },
            },
          },
        },
      },
    }),
    prisma.staffAccount.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.coreSettings.findUnique({ where: { id: 1 }, select: { billingOwnerId: true } }),
    accountingOwnerName(),
  ]);

  const ymd = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : "");
  const rows: BillingTaskRow[] = tasks.map((t) => ({
    id: t.id,
    placementId: t.placement.id,
    step: t.billingStep ?? "",
    title: t.title,
    dueAt: ymd(t.dueAt),
    done: Boolean(t.doneAt),
    doneAt: ymd(t.doneAt),
    doneBy: t.doneBy ?? "",
    owner: t.owner ?? "",
    personName: t.placement.person?.onboarding?.englishName?.trim() || t.placement.person?.name || t.placement.externalName || "-",
    companyName: t.placement.person?.dealCandidates[0]?.deal.company.name ?? t.placement.externalCompanyName ?? "",
    partnerName: t.placement.person?.partner?.name ?? "",
    joinAt: ymd(t.placement.joinAt),
    overdue: !t.doneAt && !!t.dueAt && t.dueAt < range.gte,
  }));

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const label = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

  return (
    <div className="space-y-5 p-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">請求管理</h1>
        <span className="text-3xl font-bold text-[var(--color-primary)]">{label(month)}</span>
        <nav className="flex items-center gap-1 text-sm">
          <Link href={`/billing?month=${prev}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:text-[var(--color-primary)]">
            ← {Number(prev.slice(5))}月
          </Link>
          {month !== thisMonth ? (
            <Link href="/billing" className="px-2 py-1 text-gray-500 underline decoration-dotted">
              今月
            </Link>
          ) : null}
          <Link href={`/billing?month=${next}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:text-[var(--color-primary)]">
            {Number(next.slice(5))}月 →
          </Link>
        </nav>
      </div>
      <BillingClient
        rows={rows}
        steps={BILLING_STEPS}
        me={account.name ?? ""}
        staff={staff}
        billingOwnerId={settings?.billingOwnerId ?? null}
        accountingOwner={ownerName ?? ""}
      />
    </div>
  );
}
