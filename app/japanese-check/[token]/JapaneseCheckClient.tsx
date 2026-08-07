"use client";

import { useMemo, useState } from "react";
import { JAPANESE_CHECK_QUESTIONS } from "@/lib/japanese-check-questions";
import RecorderSection, { type Recorded } from "./RecorderSection";

/**
 * 日本語チェック専用の公開ページ (入力フォームとは別リンク)。
 * 5 問すべてを録音 + 音声利用への同意 が揃うまで送信できない。
 */
export default function JapaneseCheckClient({
  token,
  personName,
  englishName,
  alreadyDone,
}: {
  token: string;
  personName: string;
  englishName: string | null;
  /** 既に録音済みか (やり直しは可能) */
  alreadyDone: boolean;
}) {
  const [recordings, setRecordings] = useState<Recorded[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordedKeys = useMemo(() => new Set(recordings.map((r) => r.key)), [recordings]);
  const remaining = JAPANESE_CHECK_QUESTIONS.filter((q) => !recordedKeys.has(q.key)).length;
  const allRecorded = remaining === 0;

  const hint = !allRecorded
    ? `あと ${remaining} 問、録音してください / ${remaining} more to record`
    : !consent
      ? "下の「同意します」にチェックを入れてください / Please check the box below"
      : null;

  const submit = async () => {
    if (!allRecorded || !consent) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/japanese-check/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordings: recordings.map((r) => ({
            key: r.key,
            dataUrl: r.dataUrl,
            seconds: r.seconds,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          `送信に失敗しました。通信環境の良い場所で、もう一度お試しください。 / Failed to send.${
            data.error ? `（${data.error}）` : ""
          }`,
        );
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(
        `送信に失敗しました。もう一度お試しください。 / Failed to send.（${
          e instanceof Error ? e.message : "error"
        }）`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-light)] p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-dark)]">送信完了 / Thank you!</h1>
          <p className="text-sm text-gray-600">
            録音を受け取りました。
            <br />
            Your recordings have been received.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-light)] px-4 py-6">
      {/* 送信中の全画面ローディング (離脱防止) */}
      {submitting ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 px-6 text-center backdrop-blur-sm">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
          <p className="mt-6 text-lg font-bold text-[var(--color-text-dark)]">送信しています…</p>
          <p className="mt-1 text-sm text-gray-500">Sending your recordings…</p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-gray-500">
            音声の送信に少し時間がかかることがあります。
            <br />
            <span className="font-medium text-[var(--color-primary)]">
              この画面を閉じずにお待ちください。
            </span>
            <br />
            Please keep this screen open.
          </p>
        </div>
      ) : null}

      <div className="mx-auto max-w-2xl space-y-4">
        {/* ヘッダー */}
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">
            SMILE MATCHING
          </p>
          <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
            日本語チェック / Japanese Check
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {englishName ? `${personName}（${englishName}）` : personName} さん
          </p>
          <p className="mt-3 rounded-xl bg-[var(--color-light)] px-3 py-2.5 text-[13px] leading-relaxed text-gray-700">
            5 つの質問に、声で答えてください。ボタンを押して話し、もう一度押すと止まります。
            うまく話せなくても大丈夫です。今の日本語のままで答えてください。
            <br />
            <span className="text-xs text-gray-500">
              Please answer 5 questions by voice. Press to start, press again to stop.
            </span>
          </p>
          {alreadyDone ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              前回の録音があります。送信すると新しい録音に置きかわります。 / Submitting again will
              replace your previous recordings.
            </p>
          ) : null}
        </div>

        {/* 録音 */}
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <RecorderSection questions={JAPANESE_CHECK_QUESTIONS} onChange={setRecordings} />

          {/* 同意 */}
          <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-[var(--color-primary)]"
            />
            <span className="text-[13px] leading-relaxed text-gray-700">
              録音した音声が、選考のために保存・利用されることに同意します。
              <br />
              <span className="text-xs text-gray-500">
                I agree that my voice recordings may be stored and used for screening.
              </span>
            </span>
          </label>

          {error ? (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
          ) : null}

          {hint ? <p className="mt-3 text-center text-[12px] text-gray-500">{hint}</p> : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !allRecorded || !consent}
            className="mt-3 w-full rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "送信中..." : "送信する / Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
