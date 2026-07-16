"use client";

import { useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";

export type PlacementData = {
  acceptedAt: string | null;
  preInterviewAt: string | null;
  companyInterviewAt: string | null;
  offerAt: string | null;
  offerAcceptedAt: string | null;
  applicationPlannedAt: string | null;
  applicationAt: string | null;
  applicationResultAt: string | null;
  applicationType: string | null;
  applicantName: string | null;
  returnHomeFlag: string | null;
  returnHomeAt: string | null;
  entryPlannedAt: string | null;
  entryAt: string | null;
  joinPlannedAt: string | null;
  joinAt: string | null;
  sixMonthStatus: string | null;
  consultation: string | null;
  currentAction: string | null;
};

export type InvoiceData = {
  id: number;
  dealId: number | null;
  unitPrice: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string;
  invoiceUrl: string | null;
  channel: string;
  partnerId: number | null;
  partnerName: string | null;
  costAmount: string | null;
  paInvoiceUrl: string | null;
  paPaid: boolean;
  paPaidAt: string | null;
  notes: string | null;
  dealTitle: string | null;
  companyName: string | null;
};

export default function PlacementPanel({
  personId,
  personName,
  initialPlacement,
  initialInvoices,
  partners,
  deals,
}: {
  personId: number;
  personName: string;
  initialPlacement: PlacementData;
  initialInvoices: InvoiceData[];
  partners: { id: number; name: string }[];
  deals: { id: number; title: string; companyName: string }[];
}) {
  const [placement, setPlacement] = useState<PlacementData>(initialPlacement);
  const [invoices, setInvoices] = useState<InvoiceData[]>(initialInvoices);

  const setDate = (key: keyof PlacementData, value: string) => {
    setPlacement((prev) => ({ ...prev, [key]: value || null }));
  };

  const persist = async (patch: Partial<PlacementData>) => {
    await fetch(`/api/personnel/${personId}/placement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const addInvoice = async () => {
    const response = await fetch(`/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    const result = await response.json();
    if (result.ok) {
      setInvoices((prev) => [
        ...prev,
        {
          id: result.invoice.id,
          dealId: null,
          unitPrice: null,
          invoiceDate: null,
          invoiceAmount: null,
          invoiceNumber: null,
          invoiceStatus: result.invoice.invoiceStatus,
          invoiceUrl: null,
          channel: result.invoice.channel,
          partnerId: null,
          partnerName: null,
          costAmount: null,
          paInvoiceUrl: null,
          paPaid: false,
          paPaidAt: null,
          notes: null,
          dealTitle: null,
          companyName: null,
        },
      ]);
    }
  };

  const patchInvoice = async (invoiceId: number, patch: Partial<InvoiceData>) => {
    const previous = invoices;
    setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, ...patch } : inv)));
    const response = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!result.ok) {
      setInvoices(previous);
    }
  };

  const deleteInvoice = async (invoiceId: number) => {
    if (!confirm("この請求情報を削除しますか？")) return;
    await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
  };

  // 対応タスクの自動抽出
  const tasks: { id: string; label: string; tone: "alert" | "warn" | "info" }[] = [];
  for (const invoice of invoices) {
    if (invoice.invoiceStatus !== "送付済み" && invoice.invoiceStatus !== "入金済み") {
      tasks.push({
        id: `invoice-send-${invoice.id}`,
        label: `${invoice.companyName ?? "企業"} への請求書送付 (${invoice.invoiceAmount ? `${invoice.invoiceAmount}円` : "金額未設定"})`,
        tone: "alert",
      });
    }
    if (invoice.channel === "PA" && invoice.paPaid === false && invoice.costAmount) {
      tasks.push({
        id: `pa-pay-${invoice.id}`,
        label: `${invoice.partnerName ?? "PA"} へ仕入支払い (${invoice.costAmount}円)`,
        tone: "warn",
      });
    }
  }
  if (placement.offerAt && !placement.offerAcceptedAt) {
    tasks.push({ id: "offer-accepted", label: "内定承諾の確認が未完了", tone: "warn" });
  }
  if (placement.offerAcceptedAt && !placement.applicationAt) {
    tasks.push({ id: "application", label: "在留資格変更申請がまだ", tone: "info" });
  }
  if (placement.applicationAt && !placement.applicationResultAt) {
    tasks.push({ id: "app-result", label: "申請結果の受け取りがまだ", tone: "info" });
  }

  return (
    <div className="space-y-5">
      {tasks.length > 0 ? (
        <section className="rounded-3xl border border-[#FDE68A] bg-[#FFFBEB] p-5">
          <p className="text-sm font-semibold text-[#92400E]">対応が必要なタスク（{tasks.length}件）</p>
          <ul className="mt-3 space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`rounded-2xl px-4 py-2 text-sm ${
                  task.tone === "alert"
                    ? "bg-[#FEE2E2] text-[#B91C1C]"
                    : task.tone === "warn"
                      ? "bg-[#FEF3C7] text-[#92400E]"
                      : "bg-[#DBEAFE] text-[#1D4ED8]"
                }`}
              >
                {task.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-dark)]">進捗 / 日程</h3>
          <p className="mt-1 text-xs text-gray-500">{personName} さんの内定後の手続き日程を管理します。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DateField label="案件受付日" value={placement.acceptedAt} onChange={(v) => { setDate("acceptedAt", v); void persist({ acceptedAt: v || null }); }} />
          <DateField label="事前面談日" value={placement.preInterviewAt} onChange={(v) => { setDate("preInterviewAt", v); void persist({ preInterviewAt: v || null }); }} />
          <DateField label="企業面談日" value={placement.companyInterviewAt} onChange={(v) => { setDate("companyInterviewAt", v); void persist({ companyInterviewAt: v || null }); }} />
          <DateField label="内定日" value={placement.offerAt} onChange={(v) => { setDate("offerAt", v); void persist({ offerAt: v || null }); }} />
          <DateField label="内定承諾日" value={placement.offerAcceptedAt} onChange={(v) => { setDate("offerAcceptedAt", v); void persist({ offerAcceptedAt: v || null }); }} />
          <DateField label="申請予定日" value={placement.applicationPlannedAt} onChange={(v) => { setDate("applicationPlannedAt", v); void persist({ applicationPlannedAt: v || null }); }} />
          <DateField label="申請日" value={placement.applicationAt} onChange={(v) => { setDate("applicationAt", v); void persist({ applicationAt: v || null }); }} />
          <DateField label="申請結果受け取り" value={placement.applicationResultAt} onChange={(v) => { setDate("applicationResultAt", v); void persist({ applicationResultAt: v || null }); }} />
          <TextField
            label="申請種別"
            value={placement.applicationType ?? ""}
            onChange={(v) => { setPlacement((p) => ({ ...p, applicationType: v })); }}
            onBlur={(v) => void persist({ applicationType: v || null })}
            placeholder="在留資格変更 / 認定証明書 など"
          />
          <TextField
            label="申請者"
            value={placement.applicantName ?? ""}
            onChange={(v) => { setPlacement((p) => ({ ...p, applicantName: v })); }}
            onBlur={(v) => void persist({ applicantName: v || null })}
          />
          <TextField
            label="一時帰国"
            value={placement.returnHomeFlag ?? ""}
            onChange={(v) => { setPlacement((p) => ({ ...p, returnHomeFlag: v })); }}
            onBlur={(v) => void persist({ returnHomeFlag: v || null })}
            placeholder="有 / 無"
          />
          <DateField label="一時帰国日" value={placement.returnHomeAt} onChange={(v) => { setDate("returnHomeAt", v); void persist({ returnHomeAt: v || null }); }} />
          <DateField label="入国予定日" value={placement.entryPlannedAt} onChange={(v) => { setDate("entryPlannedAt", v); void persist({ entryPlannedAt: v || null }); }} />
          <DateField label="入国日" value={placement.entryAt} onChange={(v) => { setDate("entryAt", v); void persist({ entryAt: v || null }); }} />
          <DateField label="入社予定日" value={placement.joinPlannedAt} onChange={(v) => { setDate("joinPlannedAt", v); void persist({ joinPlannedAt: v || null }); }} />
          <DateField label="入社日" value={placement.joinAt} onChange={(v) => { setDate("joinAt", v); void persist({ joinAt: v || null }); }} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextareaField
            label="6か月後の状況"
            value={placement.sixMonthStatus ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, sixMonthStatus: v }))}
            onBlur={(v) => void persist({ sixMonthStatus: v || null })}
          />
          <TextareaField
            label="相談したいこと"
            value={placement.consultation ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, consultation: v }))}
            onBlur={(v) => void persist({ consultation: v || null })}
          />
          <TextareaField
            label="現在の対応内容"
            value={placement.currentAction ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, currentAction: v }))}
            onBlur={(v) => void persist({ currentAction: v || null })}
            className="md:col-span-2"
          />
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">請求</h3>
            <p className="mt-1 text-xs text-gray-500">内定先企業への請求と、PA（パートナー）経由の仕入を管理します。</p>
          </div>
          <button
            type="button"
            onClick={() => void addInvoice()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            + 請求を追加
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            まだ請求情報はありません
          </p>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                    {invoice.dealTitle ?? "案件未設定"}
                    {invoice.companyName ? <span className="ml-2 text-xs text-gray-500">({invoice.companyName})</span> : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => void deleteInvoice(invoice.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <SelectField
                    label="案件"
                    value={invoice.dealId ? String(invoice.dealId) : ""}
                    onChange={(v) => void patchInvoice(invoice.id, { dealId: v ? Number(v) : null })}
                  >
                    <option value="">未設定</option>
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title} / {deal.companyName}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="単価（円）"
                    value={invoice.unitPrice ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, unitPrice: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { unitPrice: v || null })}
                  />
                  <TextField
                    label="請求金額"
                    value={invoice.invoiceAmount ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceAmount: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceAmount: v || null })}
                  />
                  <DateField
                    label="請求日"
                    value={invoice.invoiceDate}
                    onChange={(v) => void patchInvoice(invoice.id, { invoiceDate: v || null })}
                  />
                  <TextField
                    label="請求書番号"
                    value={invoice.invoiceNumber ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceNumber: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceNumber: v || null })}
                  />
                  <SelectField
                    label="請求ステータス"
                    value={invoice.invoiceStatus}
                    onChange={(v) => void patchInvoice(invoice.id, { invoiceStatus: v })}
                  >
                    <option value="未送付">未送付</option>
                    <option value="送付済み">送付済み</option>
                    <option value="入金済み">入金済み</option>
                    <option value="保留">保留</option>
                  </SelectField>
                  <TextField
                    label="請求書リンク"
                    value={invoice.invoiceUrl ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceUrl: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceUrl: v || null })}
                    placeholder="https://..."
                  />
                  <SelectField
                    label="自社 or PA"
                    value={invoice.channel}
                    onChange={(v) => void patchInvoice(invoice.id, { channel: v })}
                  >
                    <option value="自社">自社</option>
                    <option value="PA">PA</option>
                  </SelectField>
                  {invoice.channel === "PA" ? (
                    <div>
                      <label className="text-xs font-medium text-gray-600">パートナー</label>
                      <div className="mt-1">
                        <SearchableSelect
                          items={partners}
                          value={invoice.partnerId ? String(invoice.partnerId) : ""}
                          onChange={(v) => void patchInvoice(invoice.id, { partnerId: v ? Number(v) : null })}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                {invoice.channel === "PA" ? (
                  <div className="mt-3 grid gap-3 rounded-xl bg-white p-3 md:grid-cols-2 lg:grid-cols-4">
                    <TextField
                      label="仕入高"
                      value={invoice.costAmount ?? ""}
                      onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, costAmount: v } : i)))}
                      onBlur={(v) => void patchInvoice(invoice.id, { costAmount: v || null })}
                    />
                    <TextField
                      label="PAからの請求書リンク"
                      value={invoice.paInvoiceUrl ?? ""}
                      onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, paInvoiceUrl: v } : i)))}
                      onBlur={(v) => void patchInvoice(invoice.id, { paInvoiceUrl: v || null })}
                    />
                    <label className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={invoice.paPaid}
                        onChange={(e) => void patchInvoice(invoice.id, { paPaid: e.target.checked })}
                        className="accent-[var(--color-primary)]"
                      />
                      <span className="text-xs text-[var(--color-text-dark)]">PAへの支払い完了</span>
                    </label>
                    <DateField
                      label="支払日"
                      value={invoice.paPaidAt}
                      onChange={(v) => void patchInvoice(invoice.id, { paPaidAt: v || null })}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  onBlur,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        className={`${INPUT} min-h-20`}
        rows={3}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {children}
      </select>
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";
