"use client";

import { useEffect, useMemo, useState } from "react";
import CloseButton from "@/app/components/CloseButton";
import {
  INTERVIEW_SECTIONS,
  type InterviewQuestion,
  allInterviewQuestions,
} from "@/lib/interview-questions";

type CustomQuestion = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea";
};

type Props = {
  personId: number;
  personName: string;
  /** 候補者の現在の回答状況 (どの質問が未入力か判定するため) */
  answers: {
    motivation: string;
    selfIntroduction: string;
    japanPurpose: string;
    currentJob: string;
    retirementReason: string;
    interviewAnswers: Record<string, string>;
  };
  onClose: () => void;
};

export default function IntakeFormBuilderModal({
  personId,
  personName,
  answers,
  onClose,
}: Props) {
  const [excludedKeys, setExcludedKeys] = useState<string[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"text" | "textarea">("text");
  const [newRequired, setNewRequired] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // 未入力の質問を抽出
  const isAnswered = (q: InterviewQuestion): boolean => {
    if (q.existingField) {
      return (answers[q.existingField] ?? "").trim().length > 0;
    }
    const key = q.jsonKey ?? q.key;
    return (answers.interviewAnswers[key] ?? "").trim().length > 0;
  };
  const unfilled = useMemo(() => {
    return allInterviewQuestions().filter((q) => !isAnswered(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // 既存設定をロード
  useEffect(() => {
    void fetch(`/api/personnel/${personId}/intake-link`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setExcludedKeys(Array.isArray(d.excludedKeys) ? d.excludedKeys : []);
          setCustomQuestions(
            Array.isArray(d.customQuestions)
              ? d.customQuestions.map((q: CustomQuestion) => ({
                  key: q.key,
                  label: q.label,
                  required: q.required ?? false,
                  type: q.type === "textarea" ? "textarea" : "text",
                }))
              : []
          );
          if (d.path) setIssuedUrl(`${window.location.origin}${d.path}`);
        }
      })
      .finally(() => setLoading(false));
  }, [personId]);

  const toggleExclude = (key: string) => {
    setExcludedKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  };

  const addCustomQuestion = () => {
    const label = newLabel.trim();
    if (!label) return;
    setCustomQuestions((c) => [
      ...c,
      {
        key: `c_${Math.random().toString(36).slice(2, 10)}`,
        label,
        required: newRequired,
        type: newType,
      },
    ]);
    setNewLabel("");
    setNewRequired(false);
    setNewType("text");
  };

  const removeCustomQuestion = (key: string) =>
    setCustomQuestions((c) => c.filter((q) => q.key !== key));

  const issueUrl = async (regenerate = false) => {
    setIssuing(true);
    try {
      const res = await fetch(
        `/api/personnel/${personId}/intake-link${regenerate ? "?regenerate=1" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excludedKeys, customQuestions }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`発行失敗: ${data.error ?? res.statusText}`);
        return;
      }
      setIssuedUrl(`${window.location.origin}${data.path}`);
    } finally {
      setIssuing(false);
    }
  };

  const copyUrl = async () => {
    if (!issuedUrl) return;
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("コピーできませんでした");
    }
  };

  // 未入力の質問を、セクション → 質問配列 のマップにまとめる
  const unfilledBySection = useMemo(() => {
    const map = new Map<string, InterviewQuestion[]>();
    for (const section of INTERVIEW_SECTIONS) {
      const items = section.questions.filter((q) => !isAnswered(q));
      if (items.length > 0) map.set(section.title, items);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-end border-b border-gray-200 px-6 py-3">
          <CloseButton onClick={onClose} />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-center text-sm text-gray-400">読み込み中...</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">未入力の基本項目</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  まだ埋まっていない質問です。<span className="font-medium text-[var(--color-primary)]">右上の ✕</span>
                  で除外できます (候補者には聞きません)。
                </p>
                {unfilled.length === 0 ? (
                  <p className="mt-3 rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-center text-sm text-gray-400">
                    未入力項目はありません
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {[...unfilledBySection.entries()].map(([sectionTitle, qs]) => (
                      <div key={sectionTitle}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          {sectionTitle}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {qs.map((q) => {
                            const excluded = excludedKeys.includes(q.key);
                            return (
                              <div
                                key={q.key}
                                className={`group relative inline-flex items-center gap-1 rounded-full px-3 py-1 pr-7 text-xs font-medium ${
                                  excluded
                                    ? "bg-gray-100 text-gray-400 line-through"
                                    : "bg-[#FEF3C7] text-[#92400E]"
                                }`}
                                title={q.question}
                              >
                                <span className="max-w-[18rem] truncate">{q.question}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleExclude(q.key)}
                                  title={excluded ? "復活させる" : "この質問を除外"}
                                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none ${
                                    excluded
                                      ? "bg-gray-300 text-white hover:bg-gray-400"
                                      : "bg-[#92400E]/15 text-[#92400E] hover:bg-[#92400E] hover:text-white"
                                  }`}
                                >
                                  {excluded ? "↺" : "✕"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {excludedKeys.length > 0 ? (
                  <p className="mt-2 text-[11px] text-gray-400">
                    除外中: {excludedKeys.length} 件 (取り消し線のチップ ↺ で復活)
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">個別質問</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  この候補者専用の追加質問を作成できます。
                </p>

                <div className="mt-3 space-y-2">
                  {customQuestions.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-center text-xs text-gray-400">
                      個別質問はまだありません
                    </p>
                  ) : null}
                  {customQuestions.map((q) => (
                    <div
                      key={q.key}
                      className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-[var(--color-light)] px-3 py-2"
                    >
                      <input
                        value={q.label}
                        onChange={(e) =>
                          setCustomQuestions((c) =>
                            c.map((it) => (it.key === q.key ? { ...it, label: e.target.value } : it))
                          )
                        }
                        className="min-w-[120px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm focus:border-[var(--color-primary)] focus:bg-white focus:outline-none"
                      />
                      <select
                        value={q.type}
                        onChange={(e) =>
                          setCustomQuestions((c) =>
                            c.map((it) =>
                              it.key === q.key
                                ? { ...it, type: e.target.value === "textarea" ? "textarea" : "text" }
                                : it
                            )
                          )
                        }
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        <option value="text">テキスト</option>
                        <option value="textarea">テキストエリア</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            setCustomQuestions((c) =>
                              c.map((it) => (it.key === q.key ? { ...it, required: e.target.checked } : it))
                            )
                          }
                          className="accent-[var(--color-primary)]"
                        />
                        必須
                      </label>
                      <button
                        type="button"
                        onClick={() => removeCustomQuestion(q.key)}
                        title="削除"
                        className="rounded-lg p-1 text-gray-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] px-3 py-2">
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="新しい質問を入力"
                    className="min-w-[140px] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                  />
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value === "textarea" ? "textarea" : "text")}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="text">テキスト</option>
                    <option value="textarea">テキストエリア</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={newRequired}
                      onChange={(e) => setNewRequired(e.target.checked)}
                      className="accent-[var(--color-primary)]"
                    />
                    必須
                  </label>
                  <button
                    type="button"
                    onClick={addCustomQuestion}
                    disabled={!newLabel.trim()}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
              </div>

              {issuedUrl ? (
                <div className="rounded-2xl border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3">
                  <p className="text-xs font-semibold text-[#15803D]">URL を発行しました</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-gray-700">{issuedUrl}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyUrl()}
                      className="rounded-lg border border-[var(--color-primary)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                    >
                      {copied ? "コピー完了" : "URL をコピー"}
                    </button>
                    <a
                      href={issuedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      プレビュー
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("URL を再発行すると、旧 URL は使えなくなります。よろしいですか?")) {
                          void issueUrl(true);
                        }
                      }}
                      className="text-[11px] text-gray-500 hover:underline"
                    >
                      再発行
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={() => void issueUrl(false)}
            disabled={issuing}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {issuing ? "発行中..." : issuedUrl ? "設定を保存して URL を更新" : "URL を発行"}
          </button>
        </div>
      </div>
    </div>
  );
}
