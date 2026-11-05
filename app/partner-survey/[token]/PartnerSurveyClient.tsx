"use client";

import { useState } from "react";
import { INTRODUCIBLE_FIELDS, INTRODUCIBLE_NATIONALITIES, INTRODUCIBLE_RESIDENCE_STATUSES } from "@/lib/partner-profile";
import { SURVEY_CHOICES, type SurveyAnswers, type SurveyChoiceKey } from "@/lib/partner-survey";

/*
 * 見た目は Google フォームに合わせる (企業に送るので、見慣れた形にする)。
 * 紫 #673ab7 のアクセント、薄紫の背景、白いカードに 1 問ずつ。文字は黒 (#202124) で薄くしない。
 * アプリの緑 (--color-primary) はここでは使わない
 */
const ACCENT = "#673ab7";
const TEXT = "#202124";
const BORDER = "#dadce0";

export type SurveyInitial = {
  introducibleNationalities: string[];
  introducibleFields: string[];
  introducibleResidenceStatuses: string[];
  feeAmount: string;
  minFeeAmount: string;
  features: string;
  answers: SurveyAnswers;
};

type Form = SurveyInitial & { companyName: string; contactName: string };
type ListKey = "introducibleNationalities" | "introducibleFields" | "introducibleResidenceStatuses";

const NATIONALITY_EN: Record<string, string> = {
  ベトナム: "Vietnam",
  インドネシア: "Indonesia",
  ミャンマー: "Myanmar",
  フィリピン: "Philippines",
  タイ: "Thailand",
  ネパール: "Nepal",
  中国: "China",
  スリランカ: "Sri Lanka",
  カンボジア: "Cambodia",
  バングラデシュ: "Bangladesh",
  インド: "India",
  モンゴル: "Mongolia",
  韓国: "Korea",
};
const STATUS_EN: Record<string, string> = {
  技能実習: "Technical Intern Training",
  特定技能1号: "Specified Skilled Worker (i)",
  特定技能2号: "Specified Skilled Worker (ii)",
  "技術・人文知識・国際業務": "Engineer / Specialist in Humanities / International Services",
  留学生: "Student",
  特定活動: "Designated Activities",
};

export default function PartnerSurveyClient({
  token,
  initial,
  answeredAt,
  preview = false,
}: {
  token: string;
  initial: SurveyInitial;
  answeredAt: string | null;
  /** 社内確認用。送信ボタンは押せない */
  preview?: boolean;
}) {
  const [form, setForm] = useState<Form>({ ...initial, companyName: "", contactName: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((cur) => ({ ...cur, [key]: value }));
  const toggle = (key: ListKey, v: string) =>
    setForm((cur) => ({ ...cur, [key]: cur[key].includes(v) ? cur[key].filter((x) => x !== v) : [...cur[key], v] }));
  const pickAnswer = (key: SurveyChoiceKey, v: string) => setForm((cur) => ({ ...cur, answers: { ...cur.answers, [key]: [v] } }));

  const missingName = !form.companyName.trim();
  const missingCompanyLocation = !(form.answers.companyLocation ?? [])[0];
  const missingCandidateLocation = !(form.answers.candidateLocation ?? [])[0];
  const missingNationalities = form.introducibleNationalities.length === 0;
  const missingFields = form.introducibleFields.length === 0;
  const missingStatuses = form.introducibleResidenceStatuses.length === 0;
  const invalid = missingName || missingCompanyLocation || missingCandidateLocation || missingNationalities || missingFields || missingStatuses;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTried(true);
    if (preview) return;
    if (invalid) {
      setError("必須の質問に答えてください / Please answer the required questions");
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
      window.scrollTo(0, 0);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Page>
        <Card top>
          <h1 className="text-[32px] font-normal leading-tight" style={{ color: TEXT }}>
            パートナーアンケート
          </h1>
          <p className="mt-4 text-[14px] leading-6" style={{ color: TEXT }}>
            回答を送信しました。ご協力ありがとうございます。
            <br />
            Your response has been recorded. Thank you.
          </p>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      {preview ? (
        <p className="mb-3 rounded-lg bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#92400E]">
          プレビューです。パートナーにはこの画面が届きます。送信はできません
        </p>
      ) : null}
      <form onSubmit={submit} noValidate className="space-y-3">
        <Card top>
          <h1 className="text-[32px] font-normal leading-tight" style={{ color: TEXT }}>
            パートナーアンケート
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: TEXT }}>
            Partner Survey
          </p>
          <p className="mt-4 text-[14px] leading-6" style={{ color: TEXT }}>
            株式会社CROSLAN です。ご紹介いただける人材について、貴社の現在の状況を教えてください。所要時間は約3分です。
            <br />
            This is CROSLAN Inc. Please tell us about the candidates your company can introduce. It takes about 3 minutes.
          </p>
          {answeredAt ? (
            <p className="mt-3 text-[13px]" style={{ color: TEXT }}>
              前回の回答 / Last answered: {new Date(answeredAt).toLocaleDateString("ja-JP")}
            </p>
          ) : null}
          <p className="mt-4 border-t pt-3 text-[14px] text-[#d93025]" style={{ borderColor: BORDER }}>
            * 必須の質問です / Required
          </p>
        </Card>

        <Question title="会社名" en="Company name" required error={tried && missingName}>
          <TextInput value={form.companyName} onChange={(v) => set("companyName", v)} placeholder="回答を入力 / Your answer" />
        </Question>
        <Question title="ご担当者名" en="Your name">
          <TextInput value={form.contactName} onChange={(v) => set("contactName", v)} placeholder="回答を入力 / Your answer" />
        </Question>

        <Question title={SURVEY_CHOICES.companyLocation.label} en={SURVEY_CHOICES.companyLocation.en} required error={tried && missingCompanyLocation}>
          {SURVEY_CHOICES.companyLocation.options.map((o) => (
            <Option
              key={o.value}
              type="radio"
              checked={(form.answers.companyLocation ?? [])[0] === o.value}
              onChange={() => pickAnswer("companyLocation", o.value)}
              label={`${o.value} / ${o.en}`}
            />
          ))}
        </Question>

        <Question
          title={SURVEY_CHOICES.candidateLocation.label}
          en={SURVEY_CHOICES.candidateLocation.en}
          required
          error={tried && missingCandidateLocation}
        >
          {SURVEY_CHOICES.candidateLocation.options.map((o) => (
            <Option
              key={o.value}
              type="radio"
              checked={(form.answers.candidateLocation ?? [])[0] === o.value}
              onChange={() => pickAnswer("candidateLocation", o.value)}
              label={`${o.value} / ${o.en}`}
            />
          ))}
        </Question>

        <Question title="紹介できる国籍" en="Nationalities you can introduce (select all that apply)" required error={tried && missingNationalities}>
          {INTRODUCIBLE_NATIONALITIES.map((n) => (
            <Option
              key={n}
              type="checkbox"
              checked={form.introducibleNationalities.includes(n)}
              onChange={() => toggle("introducibleNationalities", n)}
              label={NATIONALITY_EN[n] ? `${n} / ${NATIONALITY_EN[n]}` : n}
            />
          ))}
        </Question>

        <Question title="紹介できる分野" en="Industries you can introduce (select all that apply)" required error={tried && missingFields}>
          {INTRODUCIBLE_FIELDS.map((f) => (
            <Option key={f} type="checkbox" checked={form.introducibleFields.includes(f)} onChange={() => toggle("introducibleFields", f)} label={f} />
          ))}
        </Question>

        <Question title="紹介できる在留資格" en="Visa status you can introduce (select all that apply)" required error={tried && missingStatuses}>
          {INTRODUCIBLE_RESIDENCE_STATUSES.map((r) => (
            <Option
              key={r}
              type="checkbox"
              checked={form.introducibleResidenceStatuses.includes(r)}
              onChange={() => toggle("introducibleResidenceStatuses", r)}
              label={STATUS_EN[r] ? `${r} / ${STATUS_EN[r]}` : r}
            />
          ))}
        </Question>

        <Question title="紹介手数料の目安" en="Standard referral fee">
          <TextInput value={form.feeAmount} onChange={(v) => set("feeAmount", v)} placeholder="例: 1名あたり 150,000円 / e.g. 150,000 JPY per person" />
        </Question>
        <Question title="最低金額" en="Minimum fee">
          <TextInput value={form.minFeeAmount} onChange={(v) => set("minFeeAmount", v)} placeholder="例: 100,000円 / e.g. 100,000 JPY" />
        </Question>
        <Question title="貴社の強み・特徴" en="Your strengths">
          <textarea
            value={form.features}
            onChange={(e) => set("features", e.target.value)}
            rows={3}
            placeholder="回答を入力 / Your answer"
            className="w-full resize-y border-0 border-b bg-transparent px-0 py-1 text-[14px] outline-none focus:border-b-2"
            style={{ color: TEXT, borderColor: BORDER, borderBottomColor: BORDER }}
            onFocus={(e) => (e.currentTarget.style.borderBottomColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderBottomColor = BORDER)}
          />
        </Question>

        {error ? (
          <p className="rounded-lg bg-white px-4 py-3 text-[14px] text-[#d93025]" style={{ border: `1px solid #d93025` }}>
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between pt-1">
          <button
            type="submit"
            disabled={sending || preview}
            className="rounded px-6 py-2 text-[14px] font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {sending ? "送信中…" : "送信 / Submit"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm({ ...initial, companyName: "", contactName: "" });
              setTried(false);
              setError(null);
            }}
            className="text-[14px] font-medium"
            style={{ color: ACCENT }}
          >
            フォームをクリア
          </button>
        </div>
        <p className="pt-4 text-center text-[12px]" style={{ color: TEXT }}>
          株式会社CROSLAN 人材事業部
        </p>
      </form>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0ebf8" }}>
      <main className="mx-auto w-full max-w-[640px] px-3 py-3 sm:py-4">{children}</main>
    </div>
  );
}

/** 白いカード。top = 先頭のカード (上に紫の帯) */
function Card({ top = false, error = false, children }: { top?: boolean; error?: boolean; children: React.ReactNode }) {
  return (
    <section
      className="relative overflow-hidden rounded-lg bg-white px-6 pb-6 pt-5"
      style={{ border: `1px solid ${error ? "#d93025" : BORDER}`, paddingTop: top ? 22 + 10 : undefined }}
    >
      {top ? <div className="absolute inset-x-0 top-0 h-[10px]" style={{ backgroundColor: ACCENT }} /> : null}
      {children}
    </section>
  );
}

function Question({
  title,
  en,
  required = false,
  error = false,
  children,
}: {
  title: string;
  en: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card error={error}>
      <p className="text-[16px] font-medium leading-6" style={{ color: TEXT }}>
        {title}
        {required ? <span className="ml-1 text-[#d93025]">*</span> : null}
      </p>
      <p className="mt-0.5 text-[13px] leading-5" style={{ color: TEXT }}>
        {en}
      </p>
      <div className="mt-4 space-y-1">{children}</div>
      {error ? <p className="mt-3 text-[13px] text-[#d93025]">この質問は必須です / This is a required question</p> : null}
    </Card>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-0 border-b bg-transparent px-0 py-1 text-[14px] outline-none sm:w-1/2"
      style={{ color: TEXT, borderBottomColor: BORDER }}
      onFocus={(e) => (e.currentTarget.style.borderBottomColor = ACCENT)}
      onBlur={(e) => (e.currentTarget.style.borderBottomColor = BORDER)}
    />
  );
}

/** Google フォームの選択肢 (丸 = 1 つ選ぶ、四角 = いくつでも) */
function Option({ type, checked, onChange, label }: { type: "radio" | "checkbox"; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-[14px]" style={{ color: TEXT }}>
      <input type={type} checked={checked} onChange={onChange} className="h-5 w-5 shrink-0 cursor-pointer" style={{ accentColor: ACCENT }} />
      <span className="leading-5">{label}</span>
    </label>
  );
}
