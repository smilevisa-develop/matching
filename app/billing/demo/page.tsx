import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { currentMonthJst, isMonthKey, monthRangeJst, shiftMonth } from "@/lib/month-stats";
import { billingSchedule } from "@/lib/billing-flow";
import BillingClient, { type LedgerRow, type LedgerStep } from "../BillingClient";

export const dynamic = "force-dynamic";

/**
 * 請求管理のお試しページ (仮のデータ)。本物と同じ画面で、押しても保存しない・シートに書かない。
 * 入社日は「今月」を基準に作るので、いつ開いても 済 / 予定 / 期限切れ が混ざって見える。
 */
type Sample = {
  name: string;
  company: string;
  partner: string | null;
  joinMonthOffset: number; // 今月から何か月前に入社したか (0 = 今月)
  joinDay: number;
  amount: number;
  cost: number | null;
  done: ("invoice" | "payment" | "pa-request" | "pa-invoice" | "pa-payment")[];
};

const SAMPLES: Sample[] = [
  { name: "NGUYEN VAN AN", company: "株式会社サンプル食品", partner: "MGI", joinMonthOffset: 1, joinDay: 10, amount: 330000, cost: 110000, done: ["invoice"] },
  { name: "TRAN THI BICH", company: "サンプル介護株式会社", partner: "VITECH", joinMonthOffset: 1, joinDay: 20, amount: 330000, cost: 110000, done: [] },
  { name: "LE THI HOA", company: "株式会社サンプル清掃", partner: null, joinMonthOffset: 1, joinDay: 3, amount: 275000, cost: null, done: ["invoice", "payment"] },
  { name: "HTET HTET", company: "サンプル建設株式会社", partner: "MHR", joinMonthOffset: 1, joinDay: 28, amount: 330000, cost: 165000, done: ["invoice", "payment"] },
  { name: "SITI NURHALIZA", company: "サンプル介護株式会社", partner: "LPK", joinMonthOffset: 2, joinDay: 5, amount: 330000, cost: 110000, done: ["invoice", "payment"] },
  { name: "AUNG KYAW MIN", company: "株式会社サンプル食品", partner: "MHR", joinMonthOffset: 2, joinDay: 18, amount: 330000, cost: 165000, done: ["invoice", "payment", "pa-request", "pa-invoice"] },
  { name: "BUDI SANTOSO", company: "サンプル建設株式会社", partner: "JAPINDO", joinMonthOffset: 3, joinDay: 12, amount: 385000, cost: 150000, done: ["invoice", "payment", "pa-request", "pa-invoice"] },
  { name: "PHAM MINH DUC", company: "株式会社サンプル清掃", partner: "TAKUMI", joinMonthOffset: 0, joinDay: 2, amount: 330000, cost: 110000, done: [] },
  { name: "NIMAL PERERA", company: "サンプル農園", partner: null, joinMonthOffset: 0, joinDay: 15, amount: 275000, cost: null, done: [] },
];

export default async function BillingDemoPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireCurrentAccount();
  const { month: requested } = await searchParams;
  const thisMonth = currentMonthJst();
  const month = isMonthKey(requested) ? requested : thisMonth;
  const range = monthRangeJst(month);
  const now = new Date();
  const ymd = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const me = account.name ?? "";

  const rows: LedgerRow[] = [];
  SAMPLES.forEach((s, i) => {
    const jm = shiftMonth(thisMonth, -s.joinMonthOffset);
    const joinYmd = `${jm}-${String(s.joinDay).padStart(2, "0")}`;
    const sch = billingSchedule(joinYmd);
    const mk = (keys: Sample["done"], dates: Date[], owner: string): LedgerStep => {
      const done = keys.every((k) => s.done.includes(k));
      const openIdx = keys.findIndex((k) => !s.done.includes(k));
      const due = dates[openIdx >= 0 ? openIdx : dates.length - 1];
      return {
        taskIds: [i * 10 + keys.length],
        allTaskIds: [i * 10 + keys.length],
        due: ymd(due),
        done,
        doneAt: done ? ymd(new Date(due.getTime() - 2 * 86_400_000)) : "",
        doneBy: done ? owner : "",
        owner,
        overdue: !done && due < now,
        inMonth: dates.some((d) => d >= range.gte && d < range.lt),
      };
    };
    // 担当は企業の担当者 (トゥイ・チンディ) が最後まで持つ
    const owner = i % 2 === 0 ? "トゥイ" : "チンディ";
    const steps = {
      invoice: mk(["invoice"], [sch.invoice.date], owner),
      payment: mk(["payment"], [sch.payment.date], owner),
      partnerInvoice: s.partner ? mk(["pa-request", "pa-invoice"], [sch.paRequest.date, sch.paInvoice.date], owner) : null,
      partnerPayment: s.partner ? mk(["pa-payment"], [sch.paPayment.date], owner) : null,
    };
    const all = Object.values(steps).filter((x): x is LedgerStep => !!x);
    if (!all.some((x) => x.inMonth || x.overdue)) return;
    rows.push({
      placementId: 900000 + i,
      personName: s.name,
      companyName: s.company,
      partnerName: s.partner ?? "",
      joinAt: joinYmd,
      invoiceAmount: s.amount,
      costAmount: s.cost,
      owner,
      steps,
    });
  });
  rows.sort((a, b) => (a.joinAt < b.joinAt ? -1 : 1));

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div className="space-y-4 p-8">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        これはお試しのページです。名前も金額も仮のデータで、丸を押しても保存されず、シートにも書きません。
        <Link href="/billing" className="ml-2 underline">
          本物の請求管理へ
        </Link>
      </div>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">請求管理 (お試し)</h1>
        <span className="text-2xl font-bold text-[var(--color-primary)]">
          {month.slice(0, 4)}年{Number(month.slice(5))}月
        </span>
        <nav className="flex items-center gap-1 text-sm">
          <Link href={`/billing/demo?month=${prev}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:text-[var(--color-primary)]">
            ← {Number(prev.slice(5))}月
          </Link>
          {month !== thisMonth ? (
            <Link href="/billing/demo" className="px-2 py-1 text-gray-500 underline decoration-dotted">
              今月
            </Link>
          ) : null}
          <Link href={`/billing/demo?month=${next}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-gray-600 hover:text-[var(--color-primary)]">
            {Number(next.slice(5))}月 →
          </Link>
        </nav>
      </div>
      <BillingClient key={month} demo rows={rows} me={me} />
    </div>
  );
}
