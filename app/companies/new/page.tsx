"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HIRING_STATUSES, SSW_INDUSTRIES, SUPPORT_METHODS } from "@/lib/company-options";

export default function NewCompanyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyKind: "通常",
    supportMethod: "",
    externalId: "",
    name: "",
    industry: SSW_INDUSTRIES[0] as string,
    location: "",
    hiringStatus: "募集中",
    notes: "",
  });

  const submit = async () => {
    if (!form.name.trim()) {
      alert("企業名を入力してください");
      return;
    }
    if (!form.externalId.trim()) {
      alert("企業IDを入力してください (自動生成はされません)");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, industry: form.companyKind === "人材紹介会社" ? "" : form.industry }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "登録に失敗しました");
        return;
      }
      if (result.driveWarning) alert(`企業は登録しました。${result.driveWarning}`);
      router.push(`/companies/${result.company.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">企業を追加</h1>
          <p className="mt-2 text-sm text-gray-500">企業情報は全アカウント共通で利用されます。</p>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Field label="区分">
            <div className="flex gap-2">
              {[
                { v: "通常", label: "通常の企業" },
                { v: "人材紹介会社", label: "人材紹介会社 (WILLOF・ADECCO など)" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={async () => {
                    setForm((current) => ({ ...current, companyKind: o.v }));
                    // 区分に合わせて次の企業ID (通常 NNsv / 人材紹介会社 NNag) を入れる (手で直してもよい)
                    const res = await fetch(`/api/companies?nextId=${encodeURIComponent(o.v)}`).then((r) => r.json()).catch(() => null);
                    if (res?.ok) setForm((current) => ({ ...current, externalId: res.externalId }));
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    form.companyKind === o.v
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {form.companyKind === "人材紹介会社" ? (
              <p className="mt-1 text-xs text-gray-500">
                候補者は 内定 → 入社待ち → 入社済み で終わります。内定者管理には出ません。企業IDは末尾が ag になります。
              </p>
            ) : null}
          </Field>
          <Field label="企業ID * (例: 14sv / 人材紹介会社は 79ag)">
            <input
              className={INPUT}
              value={form.externalId}
              onChange={(e) => setForm((current) => ({ ...current, externalId: e.target.value }))}
              placeholder="14sv"
            />
            <p className="mt-1 text-xs text-gray-500">
              保存すると Drive に「企業ID_企業名」のフォルダを作ります。区分を押すと次の番号が入ります。
            </p>
          </Field>
          <Field label="企業名 *">
            <input className={INPUT} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          </Field>
          {/* 人材紹介会社は業種を入れない */}
          {form.companyKind === "人材紹介会社" ? null : (
          <Field label="業種 (特定技能16分野)">
            <select className={INPUT} value={form.industry} onChange={(e) => setForm((current) => ({ ...current, industry: e.target.value }))}>
              {SSW_INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>{industry}</option>
              ))}
            </select>
          </Field>
          )}
          <Field label="支援方法">
            <select className={INPUT} value={form.supportMethod} onChange={(e) => setForm((current) => ({ ...current, supportMethod: e.target.value }))}>
              <option value="">未設定</option>
              {SUPPORT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
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
              {saving ? "登録中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/companies")}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50"
            >
              戻る
            </button>
          </div>
        </div>
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
