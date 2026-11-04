"use client";

import { useState } from "react";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
} from "@/lib/partner-profile";
import { SURVEY_CHOICES, type SurveyAnswers, type SurveyChoiceKey } from "@/lib/partner-survey";

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

export type SurveyInitial = {
  name: string;
  contactName: string;
  email: string;
  contactPhone: string;
  introducibleScope: string;
  introducibleNationalities: string[];
  introducibleFields: string[];
  introducibleResidenceStatuses: string[];
  feeAmount: string;
  minFeeAmount: string;
  features: string;
  answers: SurveyAnswers;
};

type ListKey = "introducibleNationalities" | "introducibleFields" | "introducibleResidenceStatuses";

/**
 * パートナーアンケート。今の登録内容が入った状態で開き、直して送ると そのままパートナー情報に入る。
 * 日本語 + 英語 (既存のパートナー登録フォームと同じ)
 */
export default function PartnerSurveyClient({
  token,
  initial,
  answeredAt,
}: {
  token: string;
  initial: SurveyInitial;
  answeredAt: string | null;
}) {
  const [form, setForm] = useState(initial);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SurveyInitial>(key: K, value: SurveyInitial[K]) => setForm((cur) => ({ ...cur, [key]: value }));
  const toggle = (key: ListKey, v: string) =>
    setForm((cur) => ({ ...cur, [key]: cur[key].includes(v) ? cur[key].filter((x) => x !== v) : [...cur[key], v] }));
  const pickAnswer = (key: SurveyChoiceKey, v: string) =>
    setForm((cur) => {
      const current = cur.answers[key] ?? [];
      const next = SURVEY_CHOICES[key].multiple
        ? current.includes(v)
          ? current.filter((x) => x !== v)
          : [...current, v]
        : current[0] === v
          ? []
          : [v];
      return { ...cur, answers: { ...cur.answers, [key]: next } };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.email.trim() && !form.contactPhone.trim()) {
      setError("メールか電話番号のどちらかを入力してください / Email or phone is required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/partner-survey/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "送信に失敗しました / Failed to send");
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
        <p className="mt-3 text-sm text-[var(--color-text-dark)]">
          回答を受け付けました。内容はこちらの登録情報に反映されました。
          <br />
          Thank you. Your answers have been saved.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-xl font-bold text-[var(--color-text-dark)]">パートナーアンケート / Partner Survey</h1>
      <p className="mt-2 text-sm text-[var(--color-text-dark)]">
        {form.name} 様
        <br />
        ご紹介いただける人材について、最新の状況を教えてください。今の登録内容が入っています。変わったところだけ直してください。
        <br />
        Please tell us the latest status of the candidates you can introduce. Your current information is pre-filled; just update what has changed.
      </p>
      {answeredAt ? (
        <p className="mt-2 text-xs text-[var(--color-text-dark)]">
          前回の回答: {new Date(answeredAt).toLocaleDateString("ja-JP")} / Last answered
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Section title="連絡先 / Contact">
          <Field label="担当者名 (Contact person)">
            <input className={INPUT} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="メール (Email)">
            <input className={INPUT} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="電話番号 (Phone)">
            <input className={INPUT} value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
          </Field>
          <Choice label={`${SURVEY_CHOICES.language.label} (${SURVEY_CHOICES.language.en})`}>
            {SURVEY_CHOICES.language.options.map((o) => (
              <Chip key={o.value} active={(form.answers.language ?? []).includes(o.value)} onClick={() => pickAnswer("language", o.value)}>
                {o.value} / {o.en}
              </Chip>
            ))}
          </Choice>
        </Section>

        <Section title="今の候補者 / Your candidates now">
          <Choice label={`${SURVEY_CHOICES.poolSize.label} (${SURVEY_CHOICES.poolSize.en})`}>
            {SURVEY_CHOICES.poolSize.options.map((o) => (
              <Chip key={o.value} active={(form.answers.poolSize ?? []).includes(o.value)} onClick={() => pickAnswer("poolSize", o.value)}>
                {o.value} / {o.en}
              </Chip>
            ))}
          </Choice>
          <Choice label={`${SURVEY_CHOICES.japaneseLevels.label} (${SURVEY_CHOICES.japaneseLevels.en})`}>
            {SURVEY_CHOICES.japaneseLevels.options.map((o) => (
              <Chip
                key={o.value}
                active={(form.answers.japaneseLevels ?? []).includes(o.value)}
                onClick={() => pickAnswer("japaneseLevels", o.value)}
              >
                {o.value} / {o.en}
              </Chip>
            ))}
          </Choice>
          <Choice label={`${SURVEY_CHOICES.responseDays.label} (${SURVEY_CHOICES.responseDays.en})`}>
            {SURVEY_CHOICES.responseDays.options.map((o) => (
              <Chip
                key={o.value}
                active={(form.answers.responseDays ?? []).includes(o.value)}
                onClick={() => pickAnswer("responseDays", o.value)}
              >
                {o.value} / {o.en}
              </Chip>
            ))}
          </Choice>
        </Section>

        <Section title="紹介できる人材 / Candidates you can introduce">
          <Choice label="候補者がいる場所 (Location of candidates)">
            {INTRODUCIBLE_SCOPES.map((s) => (
              <Chip key={s} active={form.introducibleScope === s} onClick={() => set("introducibleScope", form.introducibleScope === s ? "" : s)}>
                {s === "国内" ? "日本国内 / In Japan" : s === "国外" ? "海外 / Overseas" : "両方 / Both"}
              </Chip>
            ))}
          </Choice>
          <Choice label="国籍 (Nationality)">
            {INTRODUCIBLE_NATIONALITIES.map((n) => (
              <Chip key={n} active={form.introducibleNationalities.includes(n)} onClick={() => toggle("introducibleNationalities", n)}>
                {n}
              </Chip>
            ))}
          </Choice>
          <Choice label="分野 (Industry)">
            {INTRODUCIBLE_FIELDS.map((f) => (
              <Chip key={f} active={form.introducibleFields.includes(f)} onClick={() => toggle("introducibleFields", f)}>
                {f}
              </Chip>
            ))}
          </Choice>
          <Choice label="在留資格 (Visa status)">
            {INTRODUCIBLE_RESIDENCE_STATUSES.map((r) => (
              <Chip key={r} active={form.introducibleResidenceStatuses.includes(r)} onClick={() => toggle("introducibleResidenceStatuses", r)}>
                {r}
              </Chip>
            ))}
          </Choice>
        </Section>

        <Section title="手数料・強み / Fee and strengths">
          <Field label="紹介手数料の目安 (Standard fee)">
            <input className={INPUT} value={form.feeAmount} onChange={(e) => set("feeAmount", e.target.value)} placeholder="例: 1 名あたり 150,000 円" />
          </Field>
          <Field label="最低金額 (Minimum fee)">
            <input className={INPUT} value={form.minFeeAmount} onChange={(e) => set("minFeeAmount", e.target.value)} placeholder="例: 100,000 円" />
          </Field>
          <Field label="貴社の強み・特徴 (Your strengths)">
            <textarea
              className={`${INPUT} min-h-24`}
              value={form.features}
              onChange={(e) => set("features", e.target.value)}
              placeholder="例: 介護の経験者が多い / 日本語学校を持っている / 面接まで 3 日で調整できる"
            />
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
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">{label}</span>
      {children}
    </label>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-gray-300 bg-white text-[var(--color-text-dark)] hover:border-gray-400"
      }`}
    >
      {children}
    </button>
  );
}
