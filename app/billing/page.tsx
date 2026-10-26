import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { currentMonthJst, isMonthKey, monthRangeJst, shiftMonth } from "@/lib/month-stats";
import { accountingOwnerName } from "@/lib/billing-flow";
import { readBillingAmounts } from "@/lib/billing-sheet";
import BillingClient, { type LedgerRow, type LedgerStep } from "./BillingClient";

export const dynamic = "force-dynamic";

/**
 * 請求管理 (台帳)。1 人 1 行で、請求 → 入金 → パートナーの請求書 → パートナーへの支払い を左から並べる
 * (2026/10: freee・マネーフォワード・Misoca・board・バクラクの画面を参考に、段階ごとの箱から台帳に作り直した)。
 *
 * 出す人 = 選んだ月に期限がある段階を持つ人と、期限切れで終わっていない段階がある人。
 * 金額は企業データベースの請求管理 (請求金額・仕入高) から読む。
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireCurrentAccount();
  const { month: requested } = await searchParams;
  const thisMonth = currentMonthJst();
  const month = isMonthKey(requested) ? requested : thisMonth;
  const range = monthRangeJst(month);
  const now = new Date();

  const [placements, staff, settings, ownerName, amounts] = await Promise.all([
    prisma.personPlacement.findMany({
      where: { tasks: { some: { billingStep: { not: null } } } },
      select: {
        id: true,
        joinAt: true,
        externalName: true,
        externalCompanyName: true,
        person: {
          select: {
            id: true,
            name: true,
            onboarding: { select: { englishName: true } },
            partner: { select: { name: true } },
            dealCandidates: { orderBy: { updatedAt: "desc" }, take: 1, select: { deal: { select: { company: { select: { name: true } } } } } },
          },
        },
        tasks: {
          where: { billingStep: { not: null } },
          select: { id: true, billingStep: true, dueAt: true, doneAt: true, doneBy: true, owner: true },
        },
      },
    }),
    prisma.staffAccount.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.coreSettings.findUnique({ where: { id: 1 }, select: { billingOwnerId: true } }),
    accountingOwnerName(),
    readBillingAmounts().catch(() => new Map<number, { invoiceAmount: number | null; costAmount: number | null }>()),
  ]);

  const ymd = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : "");
  const inMonth = (d: Date | null) => !!d && d >= range.gte && d < range.lt;

  const rows: LedgerRow[] = [];
  for (const p of placements) {
    const byStep = new Map(p.tasks.map((t) => [t.billingStep, t]));
    const step = (keys: string[]): LedgerStep | null => {
      const list = keys.map((k) => byStep.get(k)).filter((t): t is NonNullable<typeof t> => !!t);
      if (list.length === 0) return null;
      // まとめた段階 (依頼 + 受け取り) は、終わっていない方の期限を出し、全部終われば済
      const open = list.find((t) => !t.doneAt);
      const shown = open ?? list[list.length - 1];
      return {
        taskIds: list.filter((t) => (open ? !t.doneAt : true)).map((t) => t.id),
        allTaskIds: list.map((t) => t.id),
        due: ymd(shown.dueAt),
        done: !open,
        doneAt: ymd(list[list.length - 1].doneAt),
        doneBy: list[list.length - 1].doneBy ?? "",
        owner: shown.owner ?? "",
        overdue: !!open && !!open.dueAt && open.dueAt < now,
        inMonth: list.some((t) => inMonth(t.dueAt)),
      };
    };
    const steps = {
      invoice: step(["invoice"]),
      payment: step(["payment"]),
      partnerInvoice: step(["pa-request", "pa-invoice"]),
      partnerPayment: step(["pa-payment"]),
    };
    const all = Object.values(steps).filter((s): s is LedgerStep => !!s);
    if (!all.some((s) => s.inMonth || s.overdue)) continue;
    const a = p.person ? amounts.get(p.person.id) : undefined;
    rows.push({
      placementId: p.id,
      personName: p.person?.onboarding?.englishName?.trim() || p.person?.name || p.externalName || "-",
      companyName: p.person?.dealCandidates[0]?.deal.company.name ?? p.externalCompanyName ?? "",
      partnerName: p.person?.partner?.name ?? "",
      joinAt: ymd(p.joinAt),
      invoiceAmount: a?.invoiceAmount ?? null,
      costAmount: a?.costAmount ?? null,
      steps,
    });
  }
  rows.sort((x, y) => (x.joinAt < y.joinAt ? -1 : x.joinAt > y.joinAt ? 1 : 0));

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-4 p-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">請求管理</h1>
        <span className="text-2xl font-bold text-[var(--color-primary)]">
          {month.slice(0, 4)}年{Number(month.slice(5))}月
        </span>
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
        me={account.name ?? ""}
        staff={staff}
        billingOwnerId={settings?.billingOwnerId ?? null}
        accountingOwner={ownerName ?? ""}
      />
    </div>
  );
}
