"use client";

import { useMemo, useState } from "react";
import {
  LOCATION_QUESTION_KEY,
  buildInterviewSections,
  parseLocationAnswer,
  type InterviewQuestion,
} from "@/lib/interview-questions";
import {
  tOption,
  tQuestion,
  tSection,
  tSectionDesc,
  tUi,
  tUiJa,
  type IntakeLang,
} from "@/lib/intake-i18n";

/**
 * 候補者向け入力フォーム (ログイン不要。URL のトークンで本人を判定)。
 *
 * 国籍に合わせた母国語で質問を出し、下に日本語を小さく添える (lib/intake-i18n.ts)。
 * ページ構成: 基本情報 → 職歴 → 面談前に必要な質問 (must) → 担当者の個別質問。
 * 回答は本人の言葉のまま保存する (日本語訳は送信後にサーバー側で付ける)。
 */

type ExistingFields = "motivation" | "selfIntroduction" | "japanPurpose" | "currentJob" | "retirementReason";

type InitialAnswers = Record<ExistingFields, string> & {
  interviewAnswers: Record<string, string>;
};

type CustomQuestion = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "file";
};

type BasicInfo = {
  englishName: string;
  birthDate: string;
  gender: string;
  phoneNumber: string;
  email: string;
  address: string;
};

export type WorkRow = { companyName: string; startDate: string; endDate: string; reason: string };

type PageBlock = {
  title: string;
  description?: string;
  /** 基本情報ページ */
  basicInfo?: boolean;
  /** 職歴ページ */
  work?: boolean;
  questions: (
    | { kind: "interview"; q: InterviewQuestion }
    | { kind: "custom"; q: CustomQuestion }
  )[];
};

const GENDER_OPTIONS = ["男性", "女性", "その他"];
const EMPTY_WORK: WorkRow = { companyName: "", startDate: "", endDate: "", reason: "" };

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";

export default function IntakeClient({
  token,
  lang,
  personName,
  englishName,
  residenceStatus,
  excludedKeys,
  customQuestions,
  basic,
  initialWork,
  initial,
}: {
  token: string;
  /** 表示言語 (国籍から決める) */
  lang: IntakeLang;
  personName: string;
  englishName: string | null;
  residenceStatus: string | null;
  excludedKeys: string[];
  customQuestions: CustomQuestion[];
  basic?: Partial<BasicInfo>;
  initialWork?: WorkRow[];
  initial: InitialAnswers;
}) {
  const t = (key: string) => tUi(lang, key);
  const ja = (key: string) => tUiJa(lang, key);

  const [form, setForm] = useState<InitialAnswers>(initial);
  const [basicForm, setBasicForm] = useState<BasicInfo>(() => {
    const b = { englishName: "", birthDate: "", gender: "", phoneNumber: "", email: "", address: "", ...(basic ?? {}) };
    // <input type=date> 用に YYYY-MM-DD へ寄せる ("1998/05/10" → "1998-05-10")
    const bd = /^\d{4}\D\d{2}\D\d{2}$/.test(b.birthDate) ? b.birthDate.replace(/\D/g, "-") : b.birthDate;
    return { ...b, birthDate: bd };
  });
  const [work, setWork] = useState<WorkRow[]>(() =>
    initialWork && initialWork.length > 0 ? initialWork : [{ ...EMPTY_WORK }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // ファイル型の個別質問: 選択されたファイル (key → dataUrl/fileName)
  const [customFiles, setCustomFiles] = useState<Record<string, { dataUrl: string; fileName: string }>>({});

  // 「今どこに住んでいますか」の回答が分岐のドライバ。
  // 未回答なら null → 分岐条件つきの質問は隠さない (安全側)
  const location = parseLocationAnswer(form.interviewAnswers[LOCATION_QUESTION_KEY]);
  // 就業状況 (在職中/退職済み)。給与欄などの表示分岐に使う (ライブ)
  const employmentStatus = form.interviewAnswers.employmentStatus ?? null;

  // 回答済み判定は初期値ベース。入力中の値で質問が消えるとフォームが崩れるため
  // form ではなく initial を見る
  const isAnswered = useMemo(() => {
    return (q: InterviewQuestion): boolean => {
      if (q.existingField) return (initial[q.existingField] ?? "").trim().length > 0;
      return (initial.interviewAnswers[q.jsonKey ?? q.key] ?? "").trim().length > 0;
    };
  }, [initial]);

  // 面談前に最低限必要な質問 (must) + 担当者の個別質問だけを出す。
  // 任意 (optional) の質問はフォームには含めない (面談で聞く)。
  const pages = useMemo<PageBlock[]>(() => {
    const blocks: PageBlock[] = [
      { title: t("basicTitle"), description: t("basicDesc"), basicInfo: true, questions: [] },
      { title: t("workTitle"), description: t("workDesc"), work: true, questions: [] },
    ];
    blocks.push(
      ...buildInterviewSections({
        priority: "must",
        ctx: { residenceStatus, location, employmentStatus },
        isExcluded: (q) => excludedKeys.includes(q.key),
        isAnswered,
      }).map((s) => ({
        title: tSection(lang, s.title),
        description: tSectionDesc(lang, s.description),
        questions: s.questions.map((q) => ({ kind: "interview" as const, q })),
      })),
    );
    if (customQuestions.length > 0) {
      blocks.push({
        title: t("customTitle"),
        questions: customQuestions.map((q) => ({ kind: "custom" as const, q })),
      });
    }
    return blocks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, residenceStatus, location, employmentStatus, excludedKeys, customQuestions, isAnswered]);

  const totalPages = pages.length;
  // 居住地の回答で分岐が変わりページ数が減ることがあるので、必ず範囲内に丸める
  const safeIdx = totalPages > 0 ? Math.min(pageIdx, totalPages - 1) : 0;
  const currentPage = pages[safeIdx];
  const isLastPage = safeIdx >= totalPages - 1;
  const progressPct = totalPages > 0 ? Math.round(((safeIdx + 1) / totalPages) * 100) : 0;

  const setExisting = (key: ExistingFields, value: string) => {
    setForm((c) => ({ ...c, [key]: value }));
  };
  const setAnswer = (key: string, value: string) => {
    setForm((c) => ({ ...c, interviewAnswers: { ...c.interviewAnswers, [key]: value } }));
  };
  const setBasic = (key: keyof BasicInfo, value: string) => setBasicForm((b) => ({ ...b, [key]: value }));
  const setWorkRow = (i: number, key: keyof WorkRow, value: string) =>
    setWork((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  // 必須の未充足チェック (現ページ分)
  const currentPageInvalid = useMemo(() => {
    if (!currentPage) return false;
    for (const item of currentPage.questions) {
      if (item.kind === "custom" && item.q.required) {
        if (item.q.type === "file") {
          if (!customFiles[item.q.key]) return true;
        } else {
          const v = form.interviewAnswers[item.q.key] ?? "";
          if (!v.trim()) return true;
        }
      }
    }
    return false;
  }, [currentPage, form, customFiles]);

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    if (currentPageInvalid) {
      alert(`${t("required")}${ja("required") ? ` / ${ja("required")}` : ""}`);
      return;
    }
    setPageIdx((i) => Math.min(i + 1, totalPages - 1));
    scrollTop();
  };
  const prev = () => {
    setPageIdx((i) => Math.max(i - 1, 0));
    scrollTop();
  };

  const submit = async () => {
    if (currentPageInvalid) {
      alert(`${t("required")}${ja("required") ? ` / ${ja("required")}` : ""}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // ファイル型の個別質問があれば先に Drive へアップロードし、
      // その URL を回答 (interviewAnswers) に載せてから本送信する
      let mergedForm = form;
      const fileEntries = Object.entries(customFiles);
      if (fileEntries.length > 0) {
        setUploadNote(t("uploading"));
        const urls: Record<string, string> = {};
        for (const [key, f] of fileEntries) {
          const up = await fetch(`/api/intake/${token}/custom-file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: f.fileName, dataUrl: f.dataUrl }),
          });
          const upData = await up.json().catch(() => ({}));
          if (!up.ok || !upData.ok || !upData.url) {
            setUploadNote(null);
            setError(t("uploadFailed"));
            return;
          }
          urls[key] = upData.url as string;
        }
        setUploadNote(null);
        mergedForm = { ...form, interviewAnswers: { ...form.interviewAnswers, ...urls } };
      }

      const res = await fetch(`/api/intake/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mergedForm,
          basic: basicForm,
          workExperiences: work.filter((r) => r.companyName || r.startDate || r.endDate || r.reason),
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? t("uploadFailed"));
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--color-light)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-md text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-dark)]">{t("thanksTitle")}</h1>
          <p className="text-sm text-gray-600">
            {t("thanksBody")}
            {ja("thanksBody") ? (
              <>
                <br />
                <span className="text-xs text-gray-400">{ja("thanksBody")}</span>
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setPageIdx(0);
            }}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {t("editAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (totalPages === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-light)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-md text-center space-y-3">
          <h1 className="text-base font-semibold text-[var(--color-text-dark)]">{t("noQuestions")}</h1>
          <p className="text-sm text-gray-500">{t("contactRecruiter")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-light)] py-6 px-4">
      {/* 送信中の全画面ローディング (離脱防止) */}
      {submitting ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6 text-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
          <p className="mt-6 text-lg font-bold text-[var(--color-text-dark)]">
            {t("sending")}
            <span className="inline-flex w-6 justify-start">
              <span className="animate-pulse">…</span>
            </span>
          </p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-gray-500">
            {uploadNote ?? ""}
            <br />
            <span className="font-medium text-[var(--color-primary)]">{t("keepOpen")}</span>
            {ja("keepOpen") ? (
              <>
                <br />
                {ja("keepOpen")}
              </>
            ) : null}
          </p>
          <div className="mt-5 flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:-0.3s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:-0.15s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[var(--color-primary)]" />
          </div>
        </div>
      ) : null}

      <div className="max-w-2xl mx-auto space-y-4">
        {/* ヘッダー (常時表示) */}
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">SMILE MATCHING</p>
              <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">{t("formTitle")}</h1>
              {ja("formTitle") ? <p className="text-xs text-gray-400">{ja("formTitle")}</p> : null}
              <p className="mt-1 text-xs text-gray-500 truncate">
                {personName}
                {englishName ? ` / ${englishName}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium text-gray-500">
                {safeIdx + 1} / {totalPages}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* 現在のページ */}
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <h2 className="text-base font-bold text-[var(--color-text-dark)]">{currentPage.title}</h2>
          {currentPage.description ? <p className="mt-1 text-xs text-gray-500">{currentPage.description}</p> : null}

          {currentPage.basicInfo ? (
            <div className="mt-5 space-y-5">
              <QuestionField label={t("englishName")} sub={ja("englishName")} type="text" hint={t("englishNameHint")} value={basicForm.englishName} onChange={(v) => setBasic("englishName", v)} />
              <div>
                <FieldLabel label={t("birthDate")} sub={ja("birthDate")} />
                <input type="date" className={INPUT} value={basicForm.birthDate} onChange={(e) => setBasic("birthDate", e.target.value)} />
              </div>
              <QuestionField
                label={t("gender")}
                sub={ja("gender")}
                type="select"
                options={GENDER_OPTIONS}
                optionLabel={(o) => tOption(lang, o)}
                unselected={t("unselected")}
                value={basicForm.gender}
                onChange={(v) => setBasic("gender", v)}
              />
              <QuestionField label={t("phone")} sub={ja("phone")} type="text" hint="090-1234-5678" value={basicForm.phoneNumber} onChange={(v) => setBasic("phoneNumber", v)} />
              <QuestionField label={t("email")} sub={ja("email")} type="text" hint="example@gmail.com" value={basicForm.email} onChange={(v) => setBasic("email", v)} />
              <QuestionField label={t("address")} sub={ja("address")} type="textarea" hint={t("addressHint")} value={basicForm.address} onChange={(v) => setBasic("address", v)} />
            </div>
          ) : currentPage.work ? (
            <div className="mt-5 space-y-4">
              {work.map((row, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500">#{i + 1}</p>
                    {work.length > 1 ? (
                      <button type="button" onClick={() => setWork((rows) => rows.filter((_, idx) => idx !== i))} className="text-xs text-gray-500 underline">
                        {t("remove")}
                      </button>
                    ) : null}
                  </div>
                  <QuestionField label={t("companyName")} sub={ja("companyName")} type="text" hint={t("companyHint")} value={row.companyName} onChange={(v) => setWorkRow(i, "companyName", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label={t("startDate")} sub={ja("startDate")} />
                      <input type="month" className={INPUT} value={toMonthInput(row.startDate)} onChange={(e) => setWorkRow(i, "startDate", e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel label={t("endDate")} sub={ja("endDate")} />
                      <input type="month" className={INPUT} value={toMonthInput(row.endDate)} onChange={(e) => setWorkRow(i, "endDate", e.target.value)} />
                    </div>
                  </div>
                  <QuestionField label={t("workContent")} sub={ja("workContent")} type="textarea" hint={t("workContentHint")} value={row.reason} onChange={(v) => setWorkRow(i, "reason", v)} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setWork((rows) => [...rows, { ...EMPTY_WORK }])}
                className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t("addRow")}
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {currentPage.questions.map((item) => {
                if (item.kind === "interview") {
                  const tr = tQuestion(lang, item.q.key, item.q.question, item.q.hint);
                  return (
                    <QuestionField
                      key={`i_${item.q.key}`}
                      label={tr.q}
                      sub={lang !== "ja" && tr.q !== item.q.question ? item.q.question : ""}
                      hint={tr.hint}
                      type={item.q.type === "textarea" ? "textarea" : item.q.type === "select" ? "select" : "text"}
                      options={item.q.options}
                      optionLabel={(o) => tOption(lang, o)}
                      unselected={t("unselected")}
                      value={item.q.existingField ? form[item.q.existingField] : form.interviewAnswers[item.q.jsonKey ?? item.q.key] ?? ""}
                      onChange={(v) => {
                        if (item.q.existingField) setExisting(item.q.existingField, v);
                        else setAnswer(item.q.jsonKey ?? item.q.key, v);
                      }}
                    />
                  );
                }
                if (item.q.type === "file") {
                  return (
                    <CustomFileField
                      key={`c_${item.q.key}`}
                      label={item.q.label + (item.q.required ? " *" : "")}
                      texts={{ choose: t("chooseFile"), change: t("change"), tooLarge: t("fileTooLarge"), readError: t("fileReadError") }}
                      file={customFiles[item.q.key] ?? null}
                      onPick={(f) =>
                        setCustomFiles((prev) => {
                          const nextFiles = { ...prev };
                          if (f) nextFiles[item.q.key] = f;
                          else delete nextFiles[item.q.key];
                          return nextFiles;
                        })
                      }
                    />
                  );
                }
                return (
                  <QuestionField
                    key={`c_${item.q.key}`}
                    label={item.q.label + (item.q.required ? " *" : "")}
                    type={item.q.type}
                    value={form.interviewAnswers[item.q.key] ?? ""}
                    onChange={(v) => setAnswer(item.q.key, v)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {/* ナビゲーション (sticky 下部) */}
        <div className="sticky bottom-3 z-10 rounded-2xl bg-white px-4 py-3 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={safeIdx === 0}
              className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              {t("back")}
            </button>
            {isLastPage ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || currentPageInvalid}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? t("submitting") : t("submit")}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                {t("next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** "2024-05-10" / "2024/05" → <input type=month> 用の "2024-05" */
function toMonthInput(v: string): string {
  const m = (v ?? "").match(/^(\d{4})\D(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
}

/** 見出し: 母国語 + その下に日本語 (小さく) */
function FieldLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <label className="block mb-1.5">
      <span className="block text-sm font-medium text-[var(--color-text-dark)]">{label}</span>
      {sub ? <span className="block text-[11px] text-gray-400">{sub}</span> : null}
    </label>
  );
}

function QuestionField({
  label,
  sub,
  hint,
  type,
  options,
  optionLabel,
  unselected,
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  hint?: string;
  type: "text" | "textarea" | "select";
  options?: readonly string[];
  /** 選択肢の表示 (値は日本語のまま保存する) */
  optionLabel?: (ja: string) => string;
  unselected?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} sub={sub} />
      {type === "textarea" ? (
        <textarea className={`${INPUT} min-h-[96px]`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} />
      ) : type === "select" && options ? (
        <select className={`${INPUT} bg-white`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{unselected ?? "未選択"}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {optionLabel ? optionLabel(opt) : opt}
            </option>
          ))}
        </select>
      ) : (
        <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} />
      )}
    </div>
  );
}

/** ファイル型の個別質問。選択したファイルを dataURL で親に渡す */
function CustomFileField({
  label,
  texts,
  file,
  onPick,
}: {
  label: string;
  texts: { choose: string; change: string; tooLarge: string; readError: string };
  file: { dataUrl: string; fileName: string } | null;
  onPick: (f: { dataUrl: string; fileName: string } | null) => void;
}) {
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = (input: HTMLInputElement) => {
    const f = input.files?.[0];
    if (!f) return;
    // 上限 20MB (Drive 経由の実用上限を考慮)
    if (f.size > 20 * 1024 * 1024) {
      setErr(texts.tooLarge);
      input.value = "";
      return;
    }
    setErr(null);
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      onPick({ dataUrl: String(reader.result ?? ""), fileName: f.name });
    };
    reader.onerror = () => {
      setReading(false);
      setErr(texts.readError);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <FieldLabel label={label} />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2">
          <span className="truncate text-sm text-[#166534]">📎 {file.fileName}</span>
          <button type="button" onClick={() => onPick(null)} className="shrink-0 text-xs font-medium text-gray-500 underline">
            {texts.change}
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 hover:bg-gray-50">
          <span>{reading ? "…" : texts.choose}</span>
          <input type="file" className="hidden" onChange={(e) => handle(e.currentTarget)} />
        </label>
      )}
      {err ? <p className="mt-1 text-[11px] text-red-600">{err}</p> : null}
    </div>
  );
}
