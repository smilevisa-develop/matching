"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SSW_INDUSTRIES } from "@/lib/company-options";
import SearchableSelect from "@/app/components/SearchableSelect";

type Option = { id: number; name: string };

export default function NewDealClient({
  companies,
  accounts,
}: {
  companies: Option[];
  accounts: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 企業詳細画面から遷移してきた場合、?companyId=X で対象企業を初期選択できる。
  //   例: /companies/deals/new?companyId=42 → 企業 42 が selected
  const requestedCompanyId = searchParams.get("companyId");
  const initialCompanyId =
    requestedCompanyId && companies.some((c) => c.id === Number(requestedCompanyId))
      ? requestedCompanyId
      : companies[0]?.id
        ? String(companies[0].id)
        : "";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    companyId: initialCompanyId,
    ownerId: accounts[0]?.id ? String(accounts[0].id) : "",
    field: SSW_INDUSTRIES[0] as string,
    priority: "normal",
    status: "募集中",
    unitPrice: "",
    deadline: "",
    acceptedAt: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const submit = async () => {
    if (!form.title.trim() || !form.companyId) {
      alert("案件名と企業を入力してください");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "案件作成に失敗しました");
        return;
      }
      router.push(`/companies/deals/${result.deal.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <Field label="案件名 *">
        <input className={INPUT} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
      </Field>
      <Field label="企業">
        <SearchableSelect
          items={companies}
          value={form.companyId}
          onChange={(v) => setForm((current) => ({ ...current, companyId: v }))}
          placeholder="企業を選択"
          searchPlaceholder="企業名で検索..."
          allowClear={false}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="分野 (特定技能16分野)">
          <select className={INPUT} value={form.field} onChange={(e) => setForm((current) => ({ ...current, field: e.target.value }))}>
            {SSW_INDUSTRIES.map((industry) => (
              <option key={industry} value={industry}>{industry}</option>
            ))}
          </select>
        </Field>
        <Field label="担当者">
          <select className={INPUT} value={form.ownerId} onChange={(e) => setForm((current) => ({ ...current, ownerId: e.target.value }))}>
            <option value="">未設定</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </Field>
        <Field label="優先度">
          <select className={INPUT} value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}>
            <option value="normal">通常</option>
            <option value="high">高</option>
            <option value="urgent">急ぎ</option>
          </select>
        </Field>
        <Field label="案件ステップ">
          <select className={INPUT} value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}>
            <option value="至急募集">至急募集</option>
            <option value="募集中">募集中</option>
            <option value="面接中">面接中</option>
            <option value="成約">成約</option>
            <option value="クローズ">クローズ</option>
          </select>
        </Field>
        <Field label="単価 (円)">
          <div className="relative">
            <input
              className={`${INPUT} pr-10`}
              value={form.unitPrice}
              onChange={(e) => setForm((current) => ({ ...current, unitPrice: e.target.value }))}
              placeholder="450000"
              inputMode="numeric"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">円</span>
          </div>
        </Field>
        <Field label="期限">
          <input className={INPUT} type="date" value={form.deadline} onChange={(e) => setForm((current) => ({ ...current, deadline: e.target.value }))} />
        </Field>
        <Field label="案件受付日">
          <input className={INPUT} type="date" value={form.acceptedAt} onChange={(e) => setForm((current) => ({ ...current, acceptedAt: e.target.value }))} />
        </Field>
      </div>
      <Field label="メモ">
        <textarea className={`${INPUT} min-h-28`} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
      </Field>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {saving ? "作成中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/companies/deals")}
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50"
        >
          戻る
        </button>
      </div>
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

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";
