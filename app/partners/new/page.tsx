"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNELS } from "@/lib/candidate-profile";
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
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
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
        body: JSON.stringify({ ...form, rating: form.rating || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`登録失敗: ${data.error ?? res.statusText}`);
        return;
      }
      router.push("/partners");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">パートナーを追加</h1>
          <p className="mt-2 text-sm text-gray-500">海外紹介パートナーの基本情報を登録します。</p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-5 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="パートナー名 *" className="md:col-span-2">
              <input
                className={INPUT}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="株式会社○○ / Mr. ○○"
              />
            </Field>
            <Field label="国">
              <input
                className={INPUT}
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="ベトナム / インドネシア など"
              />
            </Field>
            <Field label="主な連絡手段">
              <select
                className={INPUT}
                value={form.channel}
                onChange={(e) => set("channel", e.target.value)}
              >
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
            <Field label="担当者名">
              <input
                className={INPUT}
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </Field>
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
            <Field label="メモ" className="md:col-span-2">
              <textarea
                className={`${INPUT} min-h-24`}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-3 pt-2">
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
