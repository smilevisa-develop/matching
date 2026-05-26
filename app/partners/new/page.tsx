"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNELS } from "@/lib/candidate-profile";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
  PARTNER_ROLES,
  RELATIONSHIP_STATUSES,
  toCsv,
} from "@/lib/partner-profile";
import RatingStars from "../RatingStars";

const DEFAULT_CHANNEL = "未設定";

export default function NewPartnerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    country: "",
    channel: DEFAULT_CHANNEL,
    linkStatus: "未",
    contactName: "",
    notes: "",
    rating: 0,
    ratingReason: "",
    role: "",
    relationshipStatus: "",
    email: "",
    snsContact: "",
    features: "",
    introducibleNationalities: [] as string[],
    introducibleScope: "",
    introducibleFields: [] as string[],
    introducibleResidenceStatuses: [] as string[],
    feeAmount: "",
    minFeeAmount: "",
    feeShareRatio: "",
  });
  type FormKey = keyof typeof form;
  const set = <K extends FormKey>(k: K, v: (typeof form)[K]) =>
    setForm((c) => ({ ...c, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("パートナー名を入力してください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rating: form.rating || null,
          introducibleNationalities: toCsv(form.introducibleNationalities),
          introducibleFields: toCsv(form.introducibleFields),
          introducibleResidenceStatuses: toCsv(form.introducibleResidenceStatuses),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`登録失敗: ${data.error ?? res.statusText}`);
        return;
      }
      router.push(`/partners/${data.partner.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">パートナーを追加</h1>
          <p className="mt-2 text-sm text-gray-500">
            アライアンス先 (協力関係にある企業・学校・送り出し機関) を登録します。
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-1 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          <Group title="基本情報">
            <Field label="パートナー名 *" className="md:col-span-2">
              <input
                className={INPUT}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="株式会社○○ / ABC School など"
              />
            </Field>
            <Field label="国">
              <input
                className={INPUT}
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="ベトナム / インドネシア / 日本 など"
              />
            </Field>
            <Field label="役割">
              <select className={INPUT} value={form.role} onChange={(e) => set("role", e.target.value)}>
                <option value="">未設定</option>
                {PARTNER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="関係性">
              <select
                className={INPUT}
                value={form.relationshipStatus}
                onChange={(e) => set("relationshipStatus", e.target.value)}
              >
                <option value="">未設定</option>
                {RELATIONSHIP_STATUSES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="担当者名">
              <input
                className={INPUT}
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </Field>
          </Group>

          <Group title="連絡">
            <Field label="メール">
              <input className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="SNS 連絡先">
              <input
                className={INPUT}
                value={form.snsContact}
                onChange={(e) => set("snsContact", e.target.value)}
                placeholder="LINE ID / Facebook URL など"
              />
            </Field>
            <Field label="主な連絡手段">
              <select className={INPUT} value={form.channel} onChange={(e) => set("channel", e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="連絡先紐づけ">
              <select
                className={INPUT}
                value={form.linkStatus}
                onChange={(e) => set("linkStatus", e.target.value)}
              >
                <option value="未">未</option>
                <option value="完了">完了</option>
              </select>
            </Field>
          </Group>

          <Group title="評価">
            <Field label="評価 (1〜5)">
              <RatingStars value={form.rating} onChange={(v) => set("rating", v)} />
            </Field>
            <Field label="評価理由" className="md:col-span-2">
              <textarea
                className={`${INPUT} min-h-20`}
                value={form.ratingReason}
                onChange={(e) => set("ratingReason", e.target.value)}
                placeholder="例: スピード対応 / 候補者の質が高い など"
              />
            </Field>
          </Group>

          <Group title="紹介可能">
            <Field label="紹介の範囲">
              <select
                className={INPUT}
                value={form.introducibleScope}
                onChange={(e) => set("introducibleScope", e.target.value)}
              >
                <option value="">未設定</option>
                {INTRODUCIBLE_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="紹介可能な国籍" className="md:col-span-2">
              <CheckboxGroup
                options={INTRODUCIBLE_NATIONALITIES as readonly string[]}
                values={form.introducibleNationalities}
                onChange={(next) => set("introducibleNationalities", next)}
              />
            </Field>
            <Field label="紹介可能な分野" className="md:col-span-2">
              <CheckboxGroup
                options={INTRODUCIBLE_FIELDS as readonly string[]}
                values={form.introducibleFields}
                onChange={(next) => set("introducibleFields", next)}
              />
            </Field>
            <Field label="紹介可能な在留資格" className="md:col-span-2">
              <CheckboxGroup
                options={INTRODUCIBLE_RESIDENCE_STATUSES as readonly string[]}
                values={form.introducibleResidenceStatuses}
                onChange={(next) => set("introducibleResidenceStatuses", next)}
              />
            </Field>
          </Group>

          <Group title="手数料">
            <Field label="手数料 (目安)">
              <input
                className={INPUT}
                value={form.feeAmount}
                onChange={(e) => set("feeAmount", e.target.value)}
                placeholder="例: 介護WL3万円 / 5万円"
              />
            </Field>
            <Field label="最低金額">
              <input
                className={INPUT}
                value={form.minFeeAmount}
                onChange={(e) => set("minFeeAmount", e.target.value)}
              />
            </Field>
            <Field label="配分比率">
              <input
                className={INPUT}
                value={form.feeShareRatio}
                onChange={(e) => set("feeShareRatio", e.target.value)}
              />
            </Field>
          </Group>

          <Group title="メモ・特徴">
            <Field label="特徴・強み" className="md:col-span-2">
              <textarea
                className={`${INPUT} min-h-20`}
                value={form.features}
                onChange={(e) => set("features", e.target.value)}
              />
            </Field>
            <Field label="メモ" className="md:col-span-2">
              <textarea
                className={`${INPUT} min-h-24`}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </Group>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {saving ? "登録中..." : "登録"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function CheckboxGroup({
  options,
  values,
  onChange,
}: {
  options: readonly string[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = values.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => toggle(opt)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
