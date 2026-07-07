"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HIRING_STATUSES, SSW_INDUSTRIES, normalizeSswIndustry } from "@/lib/company-options";

type DealSummary = {
  id: number;
  title: string;
  status: string;
  unitPrice: string | null;
  field: string | null;
  deadline: string | null;
  ownerName: string | null;
  candidatesCount: number;
};

type InvoiceSummary = {
  id: number;
  personId: number | null;
  personName: string | null;
  dealId: number | null;
  dealTitle: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string;
  invoiceUrl: string | null;
};

type CompanyData = {
  id: number;
  externalId: string | null;
  name: string;
  industry: string | null;
  location: string | null;
  hiringStatus: string;
  driveFolderUrl: string | null;
  notes: string | null;
  deals: DealSummary[];
  invoices: InvoiceSummary[];
};

export default function CompanyDetailClient({ initialCompany }: { initialCompany: CompanyData }) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    externalId: initialCompany.externalId ?? "",
    name: initialCompany.name,
    industry: normalizeSswIndustry(initialCompany.industry) ?? SSW_INDUSTRIES[0],
    location: initialCompany.location ?? "",
    hiringStatus: initialCompany.hiringStatus,
    driveFolderUrl: initialCompany.driveFolderUrl ?? "",
    notes: initialCompany.notes ?? "",
  });

  const startEdit = () => {
    setForm({
      externalId: company.externalId ?? "",
      name: company.name,
      industry: company.industry ?? SSW_INDUSTRIES[0],
      location: company.location ?? "",
      hiringStatus: company.hiringStatus,
      driveFolderUrl: company.driveFolderUrl ?? "",
      notes: company.notes ?? "",
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert("企業名を入力してください");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/companies/${company.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "更新に失敗しました");
        return;
      }
      setCompany((prev) => ({
        ...prev,
        externalId: result.company.externalId,
        name: result.company.name,
        industry: result.company.industry,
        location: result.company.location,
        hiringStatus: result.company.hiringStatus,
        driveFolderUrl: result.company.driveFolderUrl,
        notes: result.company.notes,
      }));
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--color-primary)]">COMPANY DETAIL</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-text-dark)]">{company.name}</h1>
          <p className="mt-2 text-sm text-gray-500">企業詳細と、この企業に紐づく案件をまとめて確認できます。</p>
        </div>
        <div className="flex gap-2">
          {company.driveFolderUrl ? (
            <a
              href={company.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              title="Drive フォルダを開く"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
            >
              <DriveFolderIcon />
              <span>Drive</span>
            </a>
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
            >
              編集
            </button>
          ) : null}
          <Link
            href="/companies/deals/new"
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            + 案件を追加
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">企業情報</h2>
          {!editing ? (
            <>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <InfoRow label="企業ID" value={company.externalId ?? "-"} />
                <InfoRow label="企業名" value={company.name} />
                <InfoRow label="業種" value={normalizeSswIndustry(company.industry) ?? "-"} />
                <InfoRow label="所在地" value={company.location ?? "-"} />
                <InfoRow label="採用状況" value={company.hiringStatus} />
                <InfoRow label="案件数" value={`${company.deals.length}件`} />
                {company.driveFolderUrl ? (
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <span className="text-gray-400">Drive フォルダ</span>
                    <a
                      href={company.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-[var(--color-primary)] hover:underline"
                    >
                      開く
                    </a>
                  </div>
                ) : null}
              </div>
              {company.notes ? (
                <div className="mt-4 rounded-xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4 text-sm leading-6 text-[var(--color-text-dark)]">
                  {company.notes}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 space-y-4">
              <Field label="企業ID (任意、Drive フォルダ名に使用)">
                <input
                  className={INPUT}
                  value={form.externalId}
                  onChange={(e) => setForm((current) => ({ ...current, externalId: e.target.value }))}
                  placeholder="例: 14sv / ABC-001"
                />
              </Field>
              <Field label="企業名 *">
                <input className={INPUT} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
              </Field>
              <Field label="業種 (特定技能16分野)">
                <select className={INPUT} value={form.industry} onChange={(e) => setForm((current) => ({ ...current, industry: e.target.value }))}>
                  {SSW_INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>{industry}</option>
                  ))}
                </select>
              </Field>
              <Field label="所在地">
                <input className={INPUT} value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} />
              </Field>
              <Field label="採用状況">
                <select className={INPUT} value={form.hiringStatus} onChange={(e) => setForm((current) => ({ ...current, hiringStatus: e.target.value }))}>
                  {HIRING_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Field label="Drive フォルダ URL (任意、空欄なら企業IDで自動検索)">
                <input
                  className={INPUT}
                  value={form.driveFolderUrl}
                  onChange={(e) => setForm((current) => ({ ...current, driveFolderUrl: e.target.value }))}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
              </Field>
              <Field label="メモ">
                <textarea className={`${INPUT} min-h-28`} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
              </Field>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-gray-300 px-5 py-2 text-sm hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--color-text-dark)]">紐づいている案件</h2>
            <Link href="/companies/deals" className="text-xs text-[var(--color-primary)] hover:underline">
              案件管理を見る
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {company.deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/companies/deals/${deal.id}`}
                className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4 transition hover:border-[var(--color-secondary)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">{deal.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{deal.ownerName ?? "担当未設定"}</p>
                  </div>
                  <span className={statusClass(deal.status)}>{deal.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  <Pill>{formatUnitPrice(deal.unitPrice)}</Pill>
                  <Pill>{deal.field ?? "分野未設定"}</Pill>
                  <Pill>{deal.deadline ? `期限 ${new Date(deal.deadline).toLocaleDateString("ja-JP")}` : "期限未設定"}</Pill>
                  <Pill>{deal.candidatesCount}名</Pill>
                </div>
              </Link>
            ))}
            {company.deals.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-12 text-center text-sm text-gray-400 md:col-span-2">
                まだ案件がありません
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* 請求一覧 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-dark)]">この企業への請求</h2>
            <p className="mt-1 text-xs text-gray-500">{company.invoices.length} 件 (候補者/案件ごとに請求発行済)</p>
          </div>
          <Link href="/invoices/companies" className="text-xs text-[var(--color-primary)] hover:underline">
            請求管理を見る
          </Link>
        </div>
        {company.invoices.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
            この企業への請求はまだありません
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-gray-600">
                  <th className="px-3 py-2">ステータス</th>
                  <th className="px-3 py-2">候補者</th>
                  <th className="px-3 py-2">案件</th>
                  <th className="px-3 py-2 text-right">請求額</th>
                  <th className="px-3 py-2">請求日</th>
                  <th className="px-3 py-2">請求書</th>
                </tr>
              </thead>
              <tbody>
                {company.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <span className={invoiceStatusBadge(invoice.invoiceStatus)}>{invoice.invoiceStatus}</span>
                    </td>
                    <td className="px-3 py-2">
                      {invoice.personId ? (
                        <Link href={`/personnel/${invoice.personId}/edit`} className="text-[var(--color-primary)] hover:underline">
                          {invoice.personName ?? "-"}
                        </Link>
                      ) : (
                        invoice.personName ?? "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {invoice.dealId ? (
                        <Link href={`/companies/deals/${invoice.dealId}`} className="hover:underline">
                          {invoice.dealTitle ?? "-"}
                        </Link>
                      ) : (
                        invoice.dealTitle ?? "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {invoice.invoiceAmount ? `${parseInvoiceAmount(invoice.invoiceAmount).toLocaleString()}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("ja-JP") : "-"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {invoice.invoiceUrl ? (
                        <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">
                          開く
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function invoiceStatusBadge(status: string) {
  if (status === "入金済み") return "rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]";
  if (status === "送付済み") return "rounded-full bg-[#DBEAFE] px-2.5 py-0.5 text-[11px] font-medium text-[#1D4ED8]";
  if (status === "保留") return "rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600";
  return "rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-medium text-[#92400E]";
}

function parseInvoiceAmount(value: string | null) {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, "");
  return Number(cleaned) || 0;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-[var(--color-text-dark)]">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white px-2.5 py-1">{children}</span>;
}

function statusClass(status: string) {
  if (status === "至急募集") return "rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-medium text-[#B91C1C]";
  if (status === "募集中") return "rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-medium text-[#92400E]";
  if (status === "面接中") return "rounded-full bg-[#DBEAFE] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8]";
  return "rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-medium text-[#166534]";
}

function formatUnitPrice(value: string | null) {
  if (!value) return "単価未設定";
  const manMatch = value.match(/^(-?\d+(?:\.\d+)?)\s*万円$/);
  if (manMatch) {
    const yen = Math.round(Number(manMatch[1]) * 10000);
    return `${yen.toLocaleString("ja-JP")} 円`;
  }
  if (value.includes("円")) return value;
  const n = Number(value.replace(/,/g, ""));
  if (Number.isFinite(n)) return `${n.toLocaleString("ja-JP")} 円`;
  return `${value} 円`;
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

function DriveFolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l1.4 1.8c.2.25.5.4.82.4H18.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
    </svg>
  );
}
