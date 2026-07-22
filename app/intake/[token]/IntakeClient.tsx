"use client";

import { useMemo, useState } from "react";
import {
  LOCATION_QUESTION_KEY,
  buildInterviewSections,
  parseLocationAnswer,
  type InterviewQuestion,
} from "@/lib/interview-questions";

type ExistingFields = "motivation" | "selfIntroduction" | "japanPurpose" | "currentJob" | "retirementReason";

type InitialAnswers = Record<ExistingFields, string> & {
  interviewAnswers: Record<string, string>;
};

type CustomQuestion = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea";
};

type PageBlock = {
  title: string;
  description?: string;
  questions: (
    | { kind: "interview"; q: InterviewQuestion }
    | { kind: "custom"; q: CustomQuestion }
  )[];
};

export default function IntakeClient({
  token,
  personName,
  englishName,
  residenceStatus,
  excludedKeys,
  customQuestions,
  initial,
}: {
  token: string;
  personName: string;
  englishName: string | null;
  residenceStatus: string | null;
  excludedKeys: string[];
  customQuestions: CustomQuestion[];
  initial: InitialAnswers;
}) {
  const [form, setForm] = useState<InitialAnswers>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  /** "must" = 必須のみ表示 / "all" = 任意質問も表示 */
  const [mode, setMode] = useState<"must" | "all">("must");

  // 「今どこに住んでいますか」の回答が分岐のドライバ。
  // 未回答なら null → 分岐条件つきの質問は隠さない (安全側)
  const location = parseLocationAnswer(form.interviewAnswers[LOCATION_QUESTION_KEY]);

  // 回答済み判定は初期値ベース。入力中の値で質問が消えるとフォームが崩れるため
  // form ではなく initial を見る
  const isAnswered = useMemo(() => {
    return (q: InterviewQuestion): boolean => {
      if (q.existingField) return (initial[q.existingField] ?? "").trim().length > 0;
      return (initial.interviewAnswers[q.jsonKey ?? q.key] ?? "").trim().length > 0;
    };
  }, [initial]);

  const toPageBlocks = (
    sections: { title: string; description?: string; questions: InterviewQuestion[] }[],
  ): PageBlock[] =>
    sections.map((s) => ({
      title: s.title,
      description: s.description,
      questions: s.questions.map((q) => ({ kind: "interview" as const, q })),
    }));

  // 必須ページ。これだけで送信できる
  const mustPages = useMemo<PageBlock[]>(() => {
    return toPageBlocks(
      buildInterviewSections({
        priority: "must",
        ctx: { residenceStatus, location },
        isExcluded: (q) => excludedKeys.includes(q.key),
        isAnswered,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceStatus, location, excludedKeys, isAnswered]);

  // 任意ページ。「もっと詳しく答える」で mustPages の後ろに繋がる
  const optionalPages = useMemo<PageBlock[]>(() => {
    const blocks = toPageBlocks(
      buildInterviewSections({
        priority: "optional",
        ctx: { residenceStatus, location },
        isExcluded: (q) => excludedKeys.includes(q.key),
        isAnswered,
      }),
    );
    if (customQuestions.length > 0) {
      blocks.push({
        title: "担当者からの個別質問",
        questions: customQuestions.map((q) => ({ kind: "custom" as const, q })),
      });
    }
    return blocks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceStatus, location, excludedKeys, customQuestions, isAnswered]);

  // 必須が全部埋まっている (AI 抽出済み等) なら、最初から任意質問を見せる
  const effectiveMode = mustPages.length === 0 ? "all" : mode;
  const pages = useMemo<PageBlock[]>(
    () => (effectiveMode === "all" ? [...mustPages, ...optionalPages] : mustPages),
    [effectiveMode, mustPages, optionalPages],
  );

  const optionalCount = useMemo(
    () => optionalPages.reduce((sum, p) => sum + p.questions.length, 0),
    [optionalPages],
  );
  const totalPages = pages.length;
  // 居住地の回答で分岐が変わりページ数が減ることがあるので、必ず範囲内に丸める
  const safeIdx = totalPages > 0 ? Math.min(pageIdx, totalPages - 1) : 0;
  const currentPage = pages[safeIdx];
  const isLastPage = safeIdx >= totalPages - 1;
  const progressPct = totalPages > 0 ? Math.round(((safeIdx + 1) / totalPages) * 100) : 0;

  /** 必須ページの最後にいて、まだ任意質問を開いていない状態か */
  const atEndOfMust =
    effectiveMode === "must" && mustPages.length > 0 && safeIdx === mustPages.length - 1;

  const setExisting = (key: ExistingFields, value: string) => {
    setForm((c) => ({ ...c, [key]: value }));
  };
  const setAnswer = (key: string, value: string) => {
    setForm((c) => ({ ...c, interviewAnswers: { ...c.interviewAnswers, [key]: value } }));
  };

  // 必須カスタム質問の充足チェック (現ページ分)
  const currentPageInvalid = useMemo(() => {
    if (!currentPage) return false;
    for (const item of currentPage.questions) {
      if (item.kind === "custom" && item.q.required) {
        const v = form.interviewAnswers[item.q.key] ?? "";
        if (!v.trim()) return true;
      }
    }
    return false;
  }, [currentPage, form]);

  const next = () => {
    if (currentPageInvalid) {
      alert("必須の質問に回答してください / Please answer required fields.");
      return;
    }
    setPageIdx((i) => Math.min(i + 1, totalPages - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const prev = () => {
    setPageIdx((i) => Math.max(i - 1, 0));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (currentPageInvalid) {
      alert("必須の質問に回答してください / Please answer required fields.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "送信に失敗しました");
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
          <h1 className="text-xl font-bold text-[var(--color-text-dark)]">送信完了 / Thank you!</h1>
          <p className="text-sm text-gray-600">
            ご回答ありがとうございました。<br />
            Your answers have been submitted.
          </p>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setPageIdx(0); }}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            続けて編集する / Edit again
          </button>
        </div>
      </div>
    );
  }

  if (totalPages === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-light)] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-md text-center space-y-3">
          <h1 className="text-base font-semibold text-[var(--color-text-dark)]">
            質問はありません / No questions
          </h1>
          <p className="text-sm text-gray-500">
            担当者へご連絡ください。<br />
            Please contact the recruiter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-light)] py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* ヘッダー (常時表示) */}
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">SMILE MATCHING</p>
              <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
                事前質問フォーム / Pre-Interview
              </h1>
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
          {/* プログレスバー */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* 現在のページ */}
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <h2 className="text-base font-bold text-[var(--color-text-dark)]">{currentPage.title}</h2>
          {currentPage.description ? (
            <p className="mt-1 text-xs text-gray-500">{currentPage.description}</p>
          ) : null}
          <div className="mt-5 space-y-5">
            {currentPage.questions.map((item) =>
              item.kind === "interview" ? (
                <QuestionField
                  key={`i_${item.q.key}`}
                  label={item.q.question}
                  hint={item.q.hint}
                  type={item.q.type === "textarea" ? "textarea" : item.q.type === "select" ? "select" : "text"}
                  options={item.q.options}
                  value={
                    item.q.existingField
                      ? form[item.q.existingField]
                      : form.interviewAnswers[item.q.jsonKey ?? item.q.key] ?? ""
                  }
                  onChange={(v) => {
                    if (item.q.existingField) setExisting(item.q.existingField, v);
                    else setAnswer(item.q.jsonKey ?? item.q.key, v);
                  }}
                />
              ) : (
                <QuestionField
                  key={`c_${item.q.key}`}
                  label={item.q.label + (item.q.required ? " *" : "")}
                  type={item.q.type}
                  value={form.interviewAnswers[item.q.key] ?? ""}
                  onChange={(v) => setAnswer(item.q.key, v)}
                />
              )
            )}
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/*
          必須ページを最後まで来たら「このまま送信」できることを明示しつつ、
          任意質問への導線を出す。先に短いフォームを完走させてから追加を促す方が
          途中離脱が少ない。
        */}
        {atEndOfMust && optionalCount > 0 ? (
          <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-4">
            <p className="text-sm font-semibold text-[#166534]">
              必須の質問は以上です。このまま送信できます。
              <span className="ml-1 font-normal text-[#166534]/80">
                / That&apos;s all the required questions.
              </span>
            </p>
            <p className="mt-1.5 text-xs text-[#166534]/90">
              あと {optionalCount} 問お答えいただくと、より条件に合う求人をご紹介できます（任意）。
            </p>
            <button
              type="button"
              onClick={() => {
                setMode("all");
                setPageIdx(mustPages.length);
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="mt-3 rounded-full border border-[#16A34A] bg-white px-4 py-1.5 text-xs font-semibold text-[#16A34A] hover:bg-[#DCFCE7]"
            >
              追加の質問に答える / Answer more
            </button>
          </div>
        ) : null}

        {/* ナビゲーション (sticky 下部) */}
        <div className="sticky bottom-3 z-10 rounded-2xl bg-white px-4 py-3 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={safeIdx === 0}
              className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              ← 戻る / Back
            </button>
            {isLastPage ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {submitting ? "送信中..." : "送信する / Submit"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                次へ / Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionField({
  label,
  hint,
  type,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  type: "text" | "textarea" | "select";
  options?: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text-dark)] mb-1.5">{label}</label>
      {type === "textarea" ? (
        <textarea
          className="w-full min-h-[96px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
        />
      ) : type === "select" && options ? (
        <select
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">未選択</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
        />
      )}
    </div>
  );
}
