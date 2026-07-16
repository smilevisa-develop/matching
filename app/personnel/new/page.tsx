"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CHANNELS,
  NATIONALITIES,
  REGISTRANT_OPTIONS,
  RESIDENCE_STATUSES,
  inferRegistrantFromAccount,
} from "@/lib/candidate-profile";
import SearchableSelect from "@/app/components/SearchableSelect";

export default function NewPersonnelPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    englishName: "",
    partnerId: "",
    nationality: "ベトナム",
    residenceStatus: "技能実習",
    channel: "未設定",
    registeredBy: "",
  });

  useEffect(() => {
    void fetch("/api/partners")
      .then((response) => response.json())
      .then((result) => {
        if (result.ok) setPartners(result.partners ?? []);
      })
      .catch(() => undefined);
    // ログインしているスタッフから登録者の初期値を推定
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const inferred = inferRegistrantFromAccount({
          name: d?.account?.name,
          loginId: d?.account?.loginId,
        });
        if (inferred) setForm((f) => (f.registeredBy ? f : { ...f, registeredBy: inferred }));
      })
      .catch(() => undefined);
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.englishName.trim()) { alert("英語名を入力してください"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim() || form.englishName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { alert(`登録失敗: ${data.error}`); return; }
      router.push("/personnel");
    } catch {
      alert("登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-dark)]">候補者を追加</h1>
          <p className="text-sm text-gray-500 mt-2">
            候補者の基本情報を登録し、あとから詳細情報を追加します。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-8 space-y-5 shadow-sm">
        <Field label="英語名 *">
          <input className={INPUT} value={form.englishName} onChange={(e) => set("englishName", e.target.value)} placeholder="NGUYEN VAN AN" />
        </Field>
        <Field label="カタカナ名">
          <input className={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="グエン ヴァン アン (任意)" />
        </Field>
        <Field label="紹介パートナー">
          <SearchableSelect
            items={partners}
            value={form.partnerId}
            onChange={(v) => set("partnerId", v)}
          />
        </Field>
        <Field label="国籍">
          <select className={INPUT} value={form.nationality} onChange={(e) => set("nationality", e.target.value)}>
            {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="在留資格">
          <select className={INPUT} value={form.residenceStatus} onChange={(e) => set("residenceStatus", e.target.value)}>
            {RESIDENCE_STATUSES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="主な連絡手段">
          <select className={INPUT} value={form.channel} onChange={(e) => set("channel", e.target.value)}>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="登録者 (この候補者を追加した人)">
          <select
            className={INPUT}
            value={form.registeredBy}
            onChange={(e) => set("registeredBy", e.target.value)}
          >
            <option value="">選択してください</option>
            {REGISTRANT_OPTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting}
            className="bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
            {submitting ? "登録中..." : "登録"}
          </button>
          <button type="button" onClick={() => router.back()}
            className="border border-gray-300 px-6 py-2 rounded-lg text-sm hover:bg-gray-50">
            キャンセル
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text-dark)] mb-1">{label}</label>
      {children}
    </div>
  );
}

