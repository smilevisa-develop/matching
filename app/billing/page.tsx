import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { currentMonthJst, isMonthKey, monthRangeJst, shiftMonth } from "@/lib/month-stats";
import { billingSchedule } from "@/lib/billing-flow";
import { refreshBillingFromSheet, stepDoneFromBilling, type LedgerStepKey } from "@/lib/billing-ledger";
import { readStageDates } from "@/lib/deal-stages";
import BillingClient, { type LedgerRow, type LedgerStep } from "./BillingClient";

export const dynamic = "force-dynamic";

/**
 * 請求管理 (台帳)。1 人 1 行で、請求 → 入金 → パートナーの請求書 → パートナーへの支払い を左から並べる
 * (2026/10: freee・マネーフォワード・Misoca・board・バクラクの画面を参考に作った台帳。
 *  2026/11: 金額・パートナー・請求書リンクもアプリで持ち、企業データベースの請求管理へ書く)。
 *
 * 載る人 = 内定者管理で入社して請求のタスクがある人 + 請求 (アプリ) がある人 (人材紹介会社経由など内定者管理に居ない人も)。
 * 金額・状況は企業データベースの請求管理 (スプシが最新) を開くたびに読み込む。
 * 段階の期限は入社日から決まる (入社の翌月 1 日に請求 → その月末に入金 → 翌月にパートナーへ依頼・受け取り → 翌月末に支払い)。
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireCurrentAccount();
  const { month: requested } = await searchParams;
  const thisMonth = currentMonthJst();
  const month = isMonthKey(requested) ? requested : thisMonth;
  const range = monthRangeJst(month);
  const now = new Date();
  // 請求管理 (スプシ) が最新なので、開くたびに読み込んでから出す
  const refreshError = await refreshBillingFromSheet().then(() => null, (e) => (e instanceof Error ? e.message : String(e)));

  const personSelect = {
    id: true,
    name: true,
    onboarding: { select: { englishName: true } },
    partner: { select: { name: true } },
    billing: true,
    placement: { select: { id: true, joinAt: true, offerAt: true } },
    dealCandidates: {
      orderBy: { updatedAt: "desc" as const },
      take: 1,
      select: { stageDates: true, deal: { select: { unitPrice: true, company: { select: { name: true } }, owner: { select: { name: true } } } } },
    },
  };
  const [placements, billings] = await Promise.all([
    prisma.personPlacement.findMany({
      where: { personId: { not: null }, tasks: { some: { billingStep: { not: null } } } },
      select: {
        id: true,
        joinAt: true,
        externalCompanyName: true,
        person: { select: personSelect },
        tasks: { where: { billingStep: { not: null } }, select: { billingStep: true, dueAt: true, doneAt: true, doneBy: true, owner: true } },
      },
    }),
    prisma.personBilling.findMany({ select: { person: { select: personSelect } } }),
  ]);
  const partners = (await prisma.partner.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map((x) => x.name);

  const ymd = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : "");
  const jstStart = (s: string) => new Date(`${s}T00:00:00+09:00`);
  const inMonth = (d: Date | null) => !!d && d >= range.gte && d < range.lt;
  const yen = (s: string | null | undefined) => {
    const n = Number(String(s ?? "").replace(/[^0-9]/g, ""));
    return n > 0 ? n : null;
  };

  type P = NonNullable<(typeof placements)[number]["person"]>;
  const rows: LedgerRow[] = [];
  const seen = new Set<number>();

  const pushRow = (person: P, joinYmd: string, companyFallback: string, steps: LedgerRow["steps"], placementId: number | null) => {
    const b = person.billing;
    const deal = person.dealCandidates[0]?.deal;
    const all = Object.values(steps).filter((s): s is LedgerStep => !!s);
    rows.push({
      personId: person.id,
      personName: person.onboarding?.englishName?.trim() || person.name,
      companyName: deal?.company.name ?? companyFallback,
      owner: deal?.owner?.name ?? all.find((s) => s.owner)?.owner ?? "",
      joinAt: joinYmd,
      displayId: String(person.id).padStart(4, "0"),
      offerAt: readStageDates(person.dealCandidates[0]?.stageDates)["内定済み"] ?? ymd(person.placement?.offerAt ?? null),
      hasPlacement: placementId != null,
      placementId,
      route: b?.route ?? (person.partner ? "パートナー" : ""),
      partnerName: b?.partnerName ?? person.partner?.name ?? "",
      unitPrice: b?.unitPrice ?? yen(deal?.unitPrice),
      invoiceAmount: b?.invoiceAmount ?? null,
      costAmount: b?.partnerCost ?? null,
      invoiceDate: b?.invoiceDate ?? "",
      dueDate: b?.dueDate ?? "",
      partnerPaidDate: b?.partnerPaidDate ?? "",
      invoiceUrl: b?.invoiceUrl ?? "",
      partnerInvoiceUrl: b?.partnerInvoiceUrl ?? "",
      note: b?.note ?? "",
      steps,
      inMonth: all.some((s) => s.inMonth),
      open: all.some((s) => !s.done),
    });
  };

  // 1) 内定者管理で入社した人 (請求のタスクの期限を使う)
  for (const p of placements) {
    const person = p.person!;
    seen.add(person.id);
    const b = person.billing;
    const byStep = new Map(p.tasks.map((t) => [t.billingStep, t]));
    const step = (key: LedgerStepKey, keys: string[]): LedgerStep | null => {
      const list = keys.map((k) => byStep.get(k)).filter((t): t is NonNullable<typeof t> => !!t);
      if (list.length === 0) return null;
      const open = list.find((t) => !t.doneAt);
      const shown = open ?? list[list.length - 1];
      const done = stepDoneFromBilling(key, b) ?? !open;
      return {
        due: ymd(shown.dueAt),
        done,
        doneAt: ymd(list[list.length - 1].doneAt),
        doneBy: list[list.length - 1].doneBy ?? "",
        owner: shown.owner ?? "",
        overdue: !done && !!shown.dueAt && shown.dueAt < now,
        inMonth: list.some((t) => inMonth(t.dueAt)),
      };
    };
    const noPartner = b?.route === "自社";
    // 入社したときにパートナーが登録されていなくて、パートナーの段階のタスクが無い人は、
    // 請求管理シートでパートナー経由になっていれば入社日から期限を出す
    const hasPartner = !noPartner && !!(b?.partnerName || person.partner?.name);
    const sch = p.joinAt ? billingSchedule(ymd(p.joinAt)) : null;
    const fromSchedule = (key: LedgerStepKey, due: Date | null): LedgerStep => {
      const done = stepDoneFromBilling(key, b) ?? false;
      return { due: ymd(due), done, doneAt: "", doneBy: "", owner: "", overdue: !done && !!due && due < now, inMonth: inMonth(due) };
    };
    const partnerStep = (key: LedgerStepKey, keys: string[], due: Date | null) =>
      noPartner ? null : (step(key, keys) ?? (hasPartner && sch ? fromSchedule(key, due) : null));
    pushRow(
      person,
      ymd(p.joinAt),
      p.externalCompanyName ?? "",
      {
        invoice: step("invoice", ["invoice"]),
        payment: step("payment", ["payment"]),
        partnerInvoice: partnerStep("partnerInvoice", ["pa-request", "pa-invoice"], sch?.paInvoice.date ?? null),
        partnerPayment: partnerStep("partnerPayment", ["pa-payment"], sch?.paPayment.date ?? null),
      },
      p.id,
    );
  }

  // 2) 内定者管理に居ない人 (人材紹介会社経由など)。入社日から期限を出す
  for (const { person } of billings) {
    if (seen.has(person.id)) continue;
    const b = person.billing!;
    // 内定者カードがあればその入社日 (まだ入社していなければ空)
    const join = person.placement ? ymd(person.placement.joinAt) : (b.joinDate ?? "");
    const sch = /^\d{4}-\d{2}-\d{2}$/.test(join) ? billingSchedule(join) : null;
    const mk = (key: LedgerStepKey, due: Date | null): LedgerStep => {
      const done = stepDoneFromBilling(key, b) ?? false;
      return { due: ymd(due), done, doneAt: "", doneBy: "", owner: "", overdue: !done && !!due && due < now, inMonth: inMonth(due) };
    };
    const withPartner = (b.route ?? (person.partner ? "パートナー" : "")) !== "自社" && !!(b.partnerName ?? person.partner?.name);
    pushRow(
      person,
      join,
      "",
      {
        invoice: mk("invoice", sch?.invoice.date ?? (b.invoiceDate ? jstStart(b.invoiceDate) : null)),
        payment: mk("payment", sch?.payment.date ?? (b.dueDate ? jstStart(b.dueDate) : null)),
        partnerInvoice: withPartner ? mk("partnerInvoice", sch?.paInvoice.date ?? null) : null,
        partnerPayment: withPartner ? mk("partnerPayment", sch?.paPayment.date ?? null) : null,
      },
      person.placement?.id ?? null,
    );
  }
  rows.sort((x, y) => (x.joinAt || "9999") < (y.joinAt || "9999") ? -1 : (x.joinAt || "9999") > (y.joinAt || "9999") ? 1 : 0);

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
          <Link href={`/billing?month=${prev}`} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-[var(--color-text-dark)] hover:text-[var(--color-primary)]">
            ← {Number(prev.slice(5))}月
          </Link>
          {month !== thisMonth ? (
            <Link href="/billing" className="px-2 py-1 text-[var(--color-text-dark)] underline decoration-dotted">
              今月
            </Link>
          ) : null}
          <Link href={`/billing?month=${next}`} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-[var(--color-text-dark)] hover:text-[var(--color-primary)]">
            {Number(next.slice(5))}月 →
          </Link>
        </nav>
      </div>
      {refreshError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">請求管理シートを読み込めませんでした (前回の内容を出しています): {refreshError}</p> : null}
      <BillingClient key={month} rows={rows} me={account.name ?? ""} month={month} partners={partners} />
    </div>
  );
}
