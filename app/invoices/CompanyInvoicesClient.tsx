"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CompanyInvoiceRow = {
  id: number;
  personId: number | null;
  personName: string | null;
  dealId: number | null;
  dealTitle: string | null;
  companyId: number | null;
  companyName: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceStatus: string;
  invoiceUrl: string | null;
  createdAt: string;
};

function parseNumber(value: string | null): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, "");
  return Number(cleaned) || 0;
}

export default function CompanyInvoicesClient({
  invoices: initialInvoices,
}: {
  invoices: CompanyInvoiceRow[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [searchTerm, setSearchTerm] = useState("");

  const updateInvoice = async (id: number, patch: Partial<CompanyInvoiceRow>) => {
    const previous = invoices;
    setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)));
    const response = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setInvoices(previous);
      alert(result.error || "更新に失敗しました");
    }
  };

  const markSent = (id: number) => void updateInvoice(id, { invoiceStatus: "送付済み" });
  const markPaid = (id: number) => void updateInvoice(id, { invoiceStatus: "入金済み" });
  const reopen = (id: number) => void updateInvoice(id, { invoiceStatus: "未送付" });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const hay = [inv.companyName, inv.personName, inv.dealTitle].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [invoices, searchTerm]);

  const pending = filtered.filter((inv) => inv.invoiceStatus !== "送付済み" && inv.invoiceStatus !== "入金済み");
  const done = filtered.filter((inv) => inv.invoiceStatus === "送付済み" || inv.invoiceStatus === "入金済み");

  const totals = useMemo(() => {
    const pendingAmount = invoices
      .filter((inv) => inv.invoiceStatus !== "送付済み" && inv.invoiceStatus !== "入金済み")
      .reduce((s, inv) => s + parseNumber(inv.invoiceAmount), 0);
    const invoicedAmount = invoices.reduce((s, inv) => s + parseNumber(inv.invoiceAmount), 0);
    const paidAmount = invoices
      .filter((inv) => inv.invoiceStatus === "入金済み")
      .reduce((s, inv) => s + parseNumber(inv.invoiceAmount), 0);
    return { pendingAmount, invoicedAmount, paidAmount };
  }, [invoices]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="未送付・未対応"
          value={`${invoices.filter((i) => i.invoiceStatus !== "送付済み" && i.invoiceStatus !== "入金済み").length}件 / ${totals.pendingAmount.toLocaleString()}円`}
          tone="alert"
        />
        <SummaryCard label="請求合計" value={`${totals.invoicedAmount.toLocaleString()}円`} />
        <SummaryCard label="入金済み合計" value={`${totals.paidAmount.toLocaleString()}円`} />
      </section>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="企業名・候補者名・求人名で検索"
      />

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">未対応 ({pending.length}件)</h2>
        <p className="mt-1 text-xs text-gray-500">企業名をクリックすると企業詳細ページに移動します。</p>
        <div className="mt-4 space-y-2">
          {pending.length === 0 ? (
            <EmptyNote>未対応の企業請求はありません</EmptyNote>
          ) : (
            pending.map((invoice) => (
              <TaskRow key={invoice.id} invoice={invoice}>
                <button
                  type="button"
                  onClick={() => markSent(invoice.id)}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]"
                >
                  送付済みにする
                </button>
                <button
                  type="button"
                  onClick={() => markPaid(invoice.id)}
                  className="rounded-lg border border-[var(--color-primary)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                >
                  入金済みにする
                </button>
              </TaskRow>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">対応済み ({done.length}件)</h2>
        <div className="mt-4 space-y-2">
          {done.length === 0 ? (
            <EmptyNote muted>まだ完了タスクはありません</EmptyNote>
          ) : (
            done.map((invoice) => (
              <TaskRow key={invoice.id} invoice={invoice} doneStyle>
                <button
                  type="button"
                  onClick={() => reopen(invoice.id)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  未送付に戻す
                </button>
              </TaskRow>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TaskRow({
  invoice,
  doneStyle = false,
  children,
}: {
  invoice: CompanyInvoiceRow;
  doneStyle?: boolean;
  children: React.ReactNode;
}) {
  const amount = parseNumber(invoice.invoiceAmount);
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        doneStyle ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-[#FECACA] bg-[#FEF2F2]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${doneStyle ? "text-[#166534] line-through" : "text-[var(--color-text-dark)]"}`}>
          📨{" "}
          {invoice.companyId ? (
            <Link href={`/companies/${invoice.companyId}`} className="hover:underline">
              {invoice.companyName ?? "企業未設定"}
            </Link>
          ) : (
            invoice.companyName ?? "企業未設定"
          )}{" "}
          へ請求書送付
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          {invoice.dealTitle ?? "求人未設定"}
          {invoice.personName ? (
            <>
              {" "}
              / 候補者:{" "}
              {invoice.personId ? (
                <Link href={`/personnel/${invoice.personId}/edit`} className="text-[var(--color-primary)] hover:underline">
                  {invoice.personName}
                </Link>
              ) : (
                invoice.personName
              )}
            </>
          ) : null}
          {amount > 0 ? <> / {amount.toLocaleString()}円</> : null}
          {invoice.invoiceDate ? <> / {new Date(invoice.invoiceDate).toLocaleDateString("ja-JP")}</> : null}
          {invoice.invoiceUrl ? (
            <>
              {" "}
              /{" "}
              <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">
                請求書
              </a>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "alert" }) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        tone === "alert" ? "border-[#FECACA] bg-[#FEF2F2]" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${tone === "alert" ? "text-[#B91C1C]" : "text-[var(--color-text-dark)]"}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyNote({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      className={`rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm ${
        muted ? "text-gray-400" : "text-gray-500"
      }`}
    >
      {children}
    </p>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-md">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "検索..."}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
