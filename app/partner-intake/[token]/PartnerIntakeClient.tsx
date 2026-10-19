"use client";

import { useState } from "react";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
} from "@/lib/partner-profile";

/** フォームで選べる役割 (社内の分類のうち、パートナー自身が選べるもの) */
const ROLE_OPTIONS = ["送り出し機関", "学校", "求職", "その他"] as const;

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

export default function PartnerIntakeClient({ token }: { token: string }) {
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    role: "送り出し機関" as string,
    country: "",
    email: "",
    lineContact: "",
    introducibleScope: "" as string,
    introducibleNationalities: [] as string[],
    introducibleFields: [] as string[],
    introducibleResidenceStatuses: [] as string[],
    feeAmount: "",
    minFeeAmount: "",
  });
  // LINE の QR コード画像 (dataURL で送る)
  const [qr, setQr] = useState<{ dataUrl: string; name: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }));
  const toggle = (key: "introducibleNationalities" | "introducibleFields" | "introducibleResidenceStatuses", v: string) =>
    setForm((cur) => ({
      ...cur,
      [key]: cur[key].includes(v) ? cur[key].filter((x) => x !== v) : [...cur[key], v],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("社名 / 団体名を入力してください");
      return;
    }
    if (!form.email.trim() && !form.lineContact.trim() && !qr) {
      setError("メールか LINE (ID または QR 画像) のどちらかを入力してください / Email or LINE is required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/partner-intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lineQrDataUrl: qr?.dataUrl ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "送信に失敗しました");
        return;
      }
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-2xl font-bold text-[var(--color-text-dark)]">ありがとうございます</p>
        <p className="mt-3 text-sm text-gray-600">
          登録を受け付けました。担当者から改めてご連絡します。
          <br />
          Thank you. We have received your information and will contact you.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-xl font-bold text-[var(--color-text-dark)]">パートナー登録フォーム / Partner Registration</h1>
      <p className="mt-2 text-sm text-gray-600">
        スマイルリンクと提携いただくにあたり、貴社の情報をご記入ください。
        <br />
        Please fill in your organization&apos;s information. * は必須 / required.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Section title="基本情報 / Basic">
          <Field label="社名 / 団体名 * (Organization name)">
            <input className={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="担当者名 (Contact person)">
            <input className={INPUT} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="役割 (Type)">
            <select className={INPUT} value={form.role} onChange={(e) => set("role", e.target.value)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="拠点国 (Country)">
            <input className={INPUT} value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="例: ベトナム / Vietnam" />
          </Field>
          <Field label="メール (Email)">
            <input className={INPUT} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="LINE ID または 招待リンク (LINE ID / invite link)">
            <input className={INPUT} value={form.lineContact} onChange={(e) => set("lineContact", e.target.value)} placeholder="例: @abc123 / https://line.me/ti/g/..." />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">LINE の QR コード画像 (LINE QR code image)</span>
            {qr ? (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.dataUrl} alt="LINE QR" className="h-20 w-20 rounded object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-gray-600">{qr.name}</p>
                  <button type="button" onClick={() => setQr(null)} className="mt-1 text-xs text-gray-500 underline">
                    変更 / Change
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 hover:bg-gray-50">
                画像を選ぶ / Choose image (JPG / PNG, 5MB まで)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) {
                      setQrError("画像が大きすぎます (5MB まで) / Image too large (max 5MB)");
                      return;
                    }
                    setQrError(null);
                    const reader = new FileReader();
                    reader.onload = () => setQr({ dataUrl: String(reader.result ?? ""), name: f.name });
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
            )}
            {qrError ? <p className="mt-1 text-[11px] text-red-600">{qrError}</p> : null}
          </div>
        </Section>

        <Section title="紹介できる人材 / Candidates you can introduce">
          <Field label="範囲 (Location of candidates)">
            <div className="flex flex-wrap gap-2">
              {INTRODUCIBLE_SCOPES.map((s) => (
                <Chip key={s} active={form.introducibleScope === s} onClick={() => set("introducibleScope", form.introducibleScope === s ? "" : s)}>
                  {s === "国内" ? "日本国内 / In Japan" : s === "国外" ? "海外 / Overseas" : "両方 / Both"}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="国籍 (Nationality)">
            <div className="flex flex-wrap gap-2">
              {INTRODUCIBLE_NATIONALITIES.map((n) => (
                <Chip key={n} active={form.introducibleNationalities.includes(n)} onClick={() => toggle("introducibleNationalities", n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="分野 (Industry)">
            <div className="flex flex-wrap gap-2">
              {INTRODUCIBLE_FIELDS.map((f) => (
                <Chip key={f} active={form.introducibleFields.includes(f)} onClick={() => toggle("introducibleFields", f)}>
                  {f}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="在留資格 (Visa status)">
            <div className="flex flex-wrap gap-2">
              {INTRODUCIBLE_RESIDENCE_STATUSES.map((r) => (
                <Chip key={r} active={form.introducibleResidenceStatuses.includes(r)} onClick={() => toggle("introducibleResidenceStatuses", r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="手数料 / Fee">
          <Field label="目安 (Standard fee)">
            <input className={INPUT} value={form.feeAmount} onChange={(e) => set("feeAmount", e.target.value)} placeholder="例: 1 名あたり 150,000 円" />
          </Field>
          <Field label="最低金額 (Minimum fee)">
            <input className={INPUT} value={form.minFeeAmount} onChange={(e) => set("minFeeAmount", e.target.value)} placeholder="例: 100,000 円" />
          </Field>
        </Section>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {sending ? "送信中…" : "送信する / Submit"}
        </button>
      </form>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--color-text-dark)]">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
      }`}
    >
      {children}
    </button>
  );
}
