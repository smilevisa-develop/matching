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
  type: "text" | "textarea" | "file";
};

type BasicInfo = { englishName: string; birthDate: string; address: string };

type PageBlock = {
  title: string;
  description?: string;
  /** 基本情報 (氏名・生年月日・住所) ページなら true */
  basicInfo?: boolean;
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
  basic,
  initial,
}: {
  token: string;
  personName: string;
  englishName: string | null;
  residenceStatus: string | null;
  excludedKeys: string[];
  customQuestions: CustomQuestion[];
  basic?: BasicInfo;
  initial: InitialAnswers;
}) {
  const [form, setForm] = useState<InitialAnswers>(initial);
  const [basicForm, setBasicForm] = useState<BasicInfo>(() => {
    const b = basic ?? { englishName: "", birthDate: "", address: "" };
    // <input type=date> 用に YYYY-MM-DD へ寄せる ("1998/05/10" → "1998-05-10")
    const bd = /^\d{4}\D\d{2}\D\d{2}$/.test(b.birthDate)
      ? b.birthDate.replace(/\D/g, "-")
      : b.birthDate;
    return { ...b, birthDate: bd };
  });
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
    // 先頭に「基本情報」ページ (氏名・年齢・住所)
    const blocks: PageBlock[] = [
      {
        title: "基本情報 / Basic info",
        description: "はじめに、あなたのことを教えてください。 / Please tell us about yourself.",
        basicInfo: true,
        questions: [],
      },
    ];
    blocks.push(...buildInterviewSections({
      priority: "must",
      ctx: { residenceStatus, location, employmentStatus },
      isExcluded: (q) => excludedKeys.includes(q.key),
      isAnswered,
    }).map((s) => ({
      title: s.title,
      description: s.description,
      questions: s.questions.map((q) => ({ kind: "interview" as const, q })),
    })));
    if (customQuestions.length > 0) {
      blocks.push({
        title: "担当者からの個別質問",
        questions: customQuestions.map((q) => ({ kind: "custom" as const, q })),
      });
    }
    return blocks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceStatus, location, employmentStatus, excludedKeys, customQuestions, isAnswered]);

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
      // ファイル型の個別質問があれば先に Drive へアップロードし、
      // その URL を回答 (interviewAnswers) に載せてから本送信する
      let mergedForm = form;
      const fileEntries = Object.entries(customFiles);
      if (fileEntries.length > 0) {
        setUploadNote("ファイルを送信しています… / Uploading files…");
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
            setError(
              "ファイルの送信に失敗しました。通信環境の良い場所で、もう一度お試しください。 / Failed to upload file.",
            );
            return;
          }
          urls[key] = upData.url as string;
        }
        setUploadNote(null);
        mergedForm = {
          ...form,
          interviewAnswers: { ...form.interviewAnswers, ...urls },
        };
      }

      const res = await fetch(`/api/intake/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mergedForm, basic: basicForm }),
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
      {/* 送信中の全画面ローディング (離脱防止) */}
      {submitting ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6 text-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
          <p className="mt-6 text-lg font-bold text-[var(--color-text-dark)]">
            送信しています
            <span className="inline-flex w-6 justify-start">
              <span className="animate-pulse">…</span>
            </span>
          </p>
          <p className="mt-1 text-sm text-gray-500">Submitting your answers…</p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-gray-500">
            {uploadNote ?? "ファイルの送信に少し時間がかかることがあります。"}
            <br />
            <span className="font-medium text-[var(--color-primary)]">
              この画面を閉じずにお待ちください。
            </span>
            <br />
            Please keep this screen open.
          </p>
          {/* 動きのあるドット */}
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
          {currentPage.basicInfo ? (
            <div className="mt-5 space-y-5">
              <QuestionField
                label="お名前（ローマ字） / Full name (Roman letters)"
                type="text"
                hint="例：NGUYEN THI HUONG"
                value={basicForm.englishName}
                onChange={(v) => setBasicForm((b) => ({ ...b, englishName: v }))}
              />
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-dark)] mb-1.5">
                  生年月日 / Date of birth
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  value={basicForm.birthDate}
                  onChange={(e) => setBasicForm((b) => ({ ...b, birthDate: e.target.value }))}
                />
              </div>
              <QuestionField
                label="現在のお住まい（住所） / Current address"
                type="textarea"
                hint="例：東京都新宿区○○1-2-3 ○○マンション101"
                value={basicForm.address}
                onChange={(v) => setBasicForm((b) => ({ ...b, address: v }))}
              />
            </div>
          ) : (
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
                ) : item.q.type === "file" ? (
                  <CustomFileField
                    key={`c_${item.q.key}`}
                    label={item.q.label + (item.q.required ? " *" : "")}
                    file={customFiles[item.q.key] ?? null}
                    onPick={(f) =>
                      setCustomFiles((prev) => {
                        const next = { ...prev };
                        if (f) next[item.q.key] = f;
                        else delete next[item.q.key];
                        return next;
                      })
                    }
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
          )}
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
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
                disabled={submitting || currentPageInvalid}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
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

/** ファイル型の個別質問。選択したファイルを dataURL で親に渡す */
function CustomFileField({
  label,
  file,
  onPick,
}: {
  label: string;
  file: { dataUrl: string; fileName: string } | null;
  onPick: (f: { dataUrl: string; fileName: string } | null) => void;
}) {
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = (input: HTMLInputElement) => {
    const f = input.files?.[0];
    if (!f) return;
    // 上限 20MB (Apps Script / Drive 経由の実用上限を考慮)
    if (f.size > 20 * 1024 * 1024) {
      setErr("ファイルが大きすぎます（20MBまで）。/ File too large (max 20MB).");
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
      setErr("ファイルの読み込みに失敗しました。/ Failed to read file.");
    };
    reader.readAsDataURL(f);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text-dark)] mb-1.5">{label}</label>
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2">
          <span className="truncate text-sm text-[#166534]">📎 {file.fileName}</span>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="shrink-0 text-xs font-medium text-gray-500 underline"
          >
            変更 / Change
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500 hover:bg-gray-50">
          <span>{reading ? "読み込み中…" : "ファイルを選ぶ / Choose file"}</span>
          <input type="file" className="hidden" onChange={(e) => handle(e.currentTarget)} />
        </label>
      )}
      {err ? <p className="mt-1 text-[11px] text-red-600">{err}</p> : null}
    </div>
  );
}
