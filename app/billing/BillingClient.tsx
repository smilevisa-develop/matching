"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type LedgerStep = {
  /** 押したときに完了にするタスク (まとめた段階は、終わっていない方だけ) */
  taskIds: number[];
  /** 取り消すときに戻すタスク */
  allTaskIds: number[];
  due: string;
  done: boolean;
  doneAt: string;
  doneBy: string;
  owner: string;
  overdue: boolean;
  inMonth: boolean;
};

export type LedgerRow = {
  placementId: number;
  personName: string;
  companyName: string;
  partnerName: string;
  joinAt: string;
  invoiceAmount: number | null;
  costAmount: number | null;
  /** 企業 (求人) の担当者。請求・入金確認・パートナーへの支払いまで全部この人 */
  owner: string;
  steps: {
    invoice: LedgerStep | null;
    payment: LedgerStep | null;
    partnerInvoice: LedgerStep | null;
    partnerPayment: LedgerStep | null;
  };
};

type StepKey = keyof LedgerRow["steps"];

const COLUMNS: { key: StepKey; label: string }[] = [
  { key: "invoice", label: "① 請求" },
  { key: "payment", label: "② 入金" },
  { key: "partnerInvoice", label: "③ PA請求書" },
  { key: "partnerPayment", label: "④ PA支払" },
];

const md = (ymd: string) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "");
const yen = (n: number | null) => (n == null ? "" : `¥${Math.round(n).toLocaleString("ja-JP")}`);
const GRID = "grid grid-cols-[minmax(0,1.7fr)_0.6fr_repeat(4,minmax(0,0.85fr))] items-center gap-2";

/**
 * 請求管理の台帳。1 人 1 行で、4 つの段階を色の丸で並べる (灰 = 予定 / 赤 = 期限切れ / 緑 = 済)。
 * 丸を押すと済になり、企業データベースの請求管理に日付・状況が入る。もう一度押すと取り消す。
 */
export default function BillingClient({
  rows: initial,
  me,
  demo = false,
}: {
  /** お試し (仮のデータ)。押しても保存しない・シートに書かない */
  demo?: boolean;
  rows: LedgerRow[];
  me: string;
}) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const stepsOf = (r: LedgerRow) => Object.values(r.steps).filter((s): s is LedgerStep => !!s);
  const visible = rows.filter((r) => {
    if (filter === "overdue") return stepsOf(r).some((s) => s.overdue);
    if (filter === "mine") return r.owner === me || stepsOf(r).some((s) => !s.done && s.owner === me);
    return true;
  });

  const summary = useMemo(() => {
    const sum = (list: LedgerRow[], pick: (r: LedgerRow) => number | null) => list.reduce((t, r) => t + (pick(r) ?? 0), 0);
    const invoices = rows.filter((r) => r.steps.invoice?.inMonth);
    const payments = rows.filter((r) => r.steps.payment?.inMonth);
    const partnerPays = rows.filter((r) => r.steps.partnerPayment?.inMonth);
    return {
      invoiceCount: invoices.length,
      invoiceTotal: sum(invoices, (r) => r.invoiceAmount),
      paymentTotal: sum(payments, (r) => r.invoiceAmount),
      paidTotal: sum(payments.filter((r) => r.steps.payment?.done), (r) => r.invoiceAmount),
      partnerTotal: sum(partnerPays, (r) => r.costAmount),
      partnerCount: partnerPays.length,
      overdue: rows.filter((r) => stepsOf(r).some((s) => s.overdue)).length,
    };
  }, [rows]);

  const toggle = async (row: LedgerRow, key: StepKey) => {
    const step = row.steps[key];
    if (!step || busy) return;
    const done = !step.done;
    if (!demo && !done && !window.confirm("「済」を取り消しますか？ (請求管理シートに書いた値は戻りません。シートは手で直してください)")) return;
    setBusy(`${row.placementId}-${key}`);
    const ids = done ? step.taskIds : step.allTaskIds;
    try {
      for (const id of demo ? [] : ids) {
        const res = await fetch(`/api/onboarding/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done }),
        });
        if (!res.ok) throw new Error(String(res.status));
      }
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      setRows((prev) =>
        prev.map((r) =>
          r.placementId === row.placementId
            ? { ...r, steps: { ...r.steps, [key]: { ...step, done, overdue: done ? false : step.overdue, doneAt: done ? today : "", doneBy: done ? me : "" } } }
            : r,
        ),
      );
    } catch {
      alert("保存に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const cell = (row: LedgerRow, key: StepKey) => {
    const s = row.steps[key];
    if (!s) return <span className="text-xs text-gray-300">—</span>;
    const color = s.done ? "text-emerald-600" : s.overdue ? "text-red-600" : "text-gray-400";
    const title = s.done
      ? `済 ${md(s.doneAt)}${s.doneBy ? ` ${s.doneBy}` : ""} (押すと取り消し)`
      : `${s.overdue ? "期限切れ" : "予定"} ${md(s.due)} ・ 担当 ${s.owner || "未定"} (押すと済)`;
    return (
      <button
        type="button"
        onClick={() => void toggle(row, key)}
        disabled={busy === `${row.placementId}-${key}`}
        title={title}
        className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm tabular-nums hover:bg-gray-100 disabled:opacity-50 ${color}`}
      >
        <span aria-hidden>●</span>
        <span className={s.done ? "text-emerald-700" : s.overdue ? "font-semibold text-red-700" : "text-gray-700"}>{md(s.done ? s.doneAt : s.due)}</span>
      </button>
    );
  };

  const chip = (value: typeof filter, label: string, tone = "") => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-lg border px-3 py-1 text-sm ${filter === value ? "border-gray-400 bg-gray-100 font-semibold" : "border-gray-200 bg-white"} ${tone}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">今月の請求</p>
          <p className="text-xl font-bold text-[var(--color-text-dark)]">
            {summary.invoiceCount}件 <span className="text-base">{yen(summary.invoiceTotal)}</span>
          </p>
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">入金予定 (今月末)</p>
          <p className="text-xl font-bold text-[var(--color-text-dark)]">{yen(summary.paymentTotal) || "¥0"}</p>
          <p className="text-xs text-emerald-600">入金済 {yen(summary.paidTotal) || "¥0"}</p>
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs text-gray-500">パートナー支払予定</p>
          <p className="text-xl font-bold text-[var(--color-text-dark)]">
            {summary.partnerCount}件 <span className="text-base">{yen(summary.partnerTotal)}</span>
          </p>
        </div>
        <div className={`rounded-xl p-3 shadow-sm ${summary.overdue > 0 ? "bg-red-50" : "bg-white"}`}>
          <p className={`text-xs ${summary.overdue > 0 ? "text-red-600" : "text-gray-500"}`}>期限切れ</p>
          <p className={`text-xl font-bold ${summary.overdue > 0 ? "text-red-700" : "text-[var(--color-text-dark)]"}`}>{summary.overdue}件</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "すべて")}
        {chip("mine", "自分の担当")}
        {chip("overdue", "期限切れだけ", "text-red-700")}
        <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span>
            <span className="text-gray-400">●</span> 予定
          </span>
          <span>
            <span className="text-red-600">●</span> 期限切れ
          </span>
          <span>
            <span className="text-emerald-600">●</span> 済
          </span>
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className={`${GRID} bg-gray-50 px-4 py-2 text-xs text-gray-500`}>
          <span>内定者 ・ 企業</span>
          <span>入社</span>
          {COLUMNS.map((c) => (
            <span key={c.key}>
              {c.label}
            </span>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            この月の請求はありません。内定者管理でカードを「請求」に移すと、ここに出ます。
          </p>
        ) : (
          visible.map((r) => (
            <div key={r.placementId} className={`${GRID} border-t border-gray-100 px-4 py-2.5 ${stepsOf(r).some((s) => s.overdue) ? "bg-red-50/60" : ""}`}>
              <Link href={demo ? "#" : `/onboarding?open=${r.placementId}`} onClick={(e) => demo && e.preventDefault()} className="min-w-0 hover:underline">
                <p className="truncate text-sm font-semibold text-[var(--color-text-dark)]">{r.personName}</p>
                <p className="truncate text-xs text-gray-500">
                  {[r.companyName, `担当 ${r.owner || "未定"}`, yen(r.invoiceAmount), r.partnerName ? `PA: ${r.partnerName}${r.costAmount ? ` ${yen(r.costAmount)}` : ""}` : ""]
                    .filter(Boolean)
                    .join(" ・ ")}
                </p>
              </Link>
              <span className="text-sm tabular-nums text-gray-700">{md(r.joinAt)}</span>
              {COLUMNS.map((c) => (
                <span key={c.key}>{cell(r, c.key)}</span>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-gray-500">
        <span>
          丸を押すと「済」になり、日付が企業データベースの請求管理に入ります。名前を押すと内定者カードが開きます。
          {demo ? null : (
            <Link href="/billing/demo" className="ml-2 text-[var(--color-primary)] underline">
              仮のデータで試す
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
