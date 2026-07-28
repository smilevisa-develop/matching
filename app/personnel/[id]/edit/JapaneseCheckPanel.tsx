"use client";

import { useState } from "react";

/**
 * 候補者詳細の 日本語チェック パネル。
 *
 * intake フォームで候補者が録音 → Gemini が判定した結果を面接官向けに表示する。
 *   - 推定レベル (N1〜N5 相当) を大きく
 *   - 発音 / 流暢さ / 語彙 / 文法 の 4 観点スコア (1〜5)
 *   - AI 所見 (どの業種なら通用するか)
 *   - 各設問の文字起こし + 録音の再生 (Drive はプライベートなので audio-proxy 経由)
 *
 * 判定に失敗して録音だけ保存されている場合 (assessedAt=null) は「再判定」できる。
 */

export type JapaneseCheckRecordingView = {
  key: string;
  question: string;
  transcript: string;
  driveFileId: string | null;
  driveFileUrl: string | null;
  mimeType: string;
};

export type JapaneseCheckView = {
  estimatedLevel: string | null;
  pronunciation: number | null;
  fluency: number | null;
  vocabulary: number | null;
  grammar: number | null;
  summary: string | null;
  recordings: JapaneseCheckRecordingView[];
  assessedAt: string | null;
};

/** 推定レベルに応じた色 (概ね N2 以上=緑, N3=青, N4=橙, それ以下=灰) */
function levelStyle(level: string | null): { bg: string; text: string; border: string } {
  const l = level ?? "";
  if (/N1|N2/.test(l)) return { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" };
  if (/N3/.test(l)) return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
  if (/N4/.test(l)) return { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" };
  return { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" };
}

export default function JapaneseCheckPanel({
  personId,
  initial,
}: {
  personId: number;
  initial: JapaneseCheckView | null;
}) {
  const [data, setData] = useState<JapaneseCheckView | null>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // まだ一度も録音されていない
  if (!data) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">日本語チェック</p>
        <p className="mt-2 text-sm text-gray-500">
          まだ実施されていません。フォーム（intake リンク）の最後で、候補者が 3 問を録音すると
          AI が日本語レベルを判定します。
        </p>
      </section>
    );
  }

  const assessed = Boolean(data.assessedAt);

  const rejudge = async () => {
    setBusy(true);
    setNote("再判定中...（音声を AI が聞いています）");
    try {
      const res = await fetch(`/api/personnel/${personId}/japanese-check/rejudge`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setNote(`再判定に失敗しました: ${json.error ?? res.statusText}`);
      } else {
        setData(json.check as JapaneseCheckView);
        setNote(null);
      }
    } catch (e) {
      setNote(`再判定に失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const lv = levelStyle(data.estimatedLevel);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">日本語チェック</p>
        <button
          type="button"
          onClick={() => void rejudge()}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "判定中..." : "再判定"}
        </button>
      </div>

      {!assessed ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          録音は保存されていますが、AI 判定がまだ完了していません。「再判定」を押してください。
        </div>
      ) : null}

      {/* 推定レベル + 4 観点スコア */}
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div
          className="flex min-w-[140px] flex-col items-center justify-center rounded-xl border px-4 py-3 text-center"
          style={{ backgroundColor: lv.bg, borderColor: lv.border }}
        >
          <span className="text-[11px] font-medium" style={{ color: lv.text }}>
            推定レベル
          </span>
          <span className="mt-0.5 text-2xl font-bold" style={{ color: lv.text }}>
            {data.estimatedLevel ?? "—"}
          </span>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2.5">
          <ScoreBar label="発音" value={data.pronunciation} />
          <ScoreBar label="流暢さ" value={data.fluency} />
          <ScoreBar label="語彙" value={data.vocabulary} />
          <ScoreBar label="文法" value={data.grammar} />
        </div>
      </div>

      {/* AI 所見 */}
      {data.summary ? (
        <div className="mt-4 rounded-xl bg-[var(--color-light)] px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-500">AI 所見</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-dark)]">{data.summary}</p>
        </div>
      ) : null}

      {/* 各設問の文字起こし + 録音再生 */}
      {data.recordings.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-semibold text-gray-500">録音と文字起こし</p>
          {data.recordings.map((r, idx) => (
            <div key={r.key} className="rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-[12px] font-medium text-gray-600">
                {idx + 1}. {r.question || r.key}
              </p>
              {r.transcript ? (
                <p className="mt-1 text-sm text-[var(--color-text-dark)]">{r.transcript}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">（文字起こしなし）</p>
              )}
              {r.driveFileId ? (
                <audio
                  controls
                  preload="none"
                  src={`/api/audio-proxy?id=${encodeURIComponent(r.driveFileId)}`}
                  className="mt-2 w-full"
                  aria-label={`録音 ${idx + 1} の再生`}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          {assessed && data.assessedAt
            ? `判定日時 ${new Date(data.assessedAt).toLocaleString("ja-JP")}`
            : ""}
        </p>
        {note ? <p className="text-[11px] text-gray-500">{note}</p> : null}
      </div>
    </section>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = typeof value === "number" ? Math.max(0, Math.min(5, value)) : 0;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
        <span className="text-[11px] font-semibold text-gray-700">
          {value != null ? `${v} / 5` : "—"}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= v ? "bg-[var(--color-primary)]" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
