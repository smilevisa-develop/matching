"use client";

import { useState } from "react";

/**
 * 候補者詳細「詳細情報」タブ最上部の 日本語チェック パネル。
 *
 * intake フォームで候補者が録音 → Gemini が判定した結果を面接官向けに表示する。
 * 初期は折りたたみ状態で「推定レベル」だけを見せ、展開すると:
 *   - N5→N1 のラダーで推定レベルの位置を直感表示 + レベルの意味
 *   - 発音 / 流暢さ / 語彙 / 文法 をレーダーチャート + 定性ラベルで表示
 *   - AI 所見 (どの業種なら通用するか)
 *   - 各設問の文字起こし + 録音の再生 (Drive はプライベートなので audio-proxy 経由)
 *   - 判定に失敗して録音だけの場合 (assessedAt=null) は「再判定」
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

const LEVEL_LADDER = ["N5", "N4", "N3", "N2", "N1"] as const;

/** "N3 相当" などから N番号を取り出す */
function levelBase(level: string | null): (typeof LEVEL_LADDER)[number] | null {
  const m = (level ?? "").match(/N[1-5]/);
  return (m?.[0] as (typeof LEVEL_LADDER)[number] | undefined) ?? null;
}

/** レベルの意味を一言で */
function levelMeaning(level: string | null): string {
  switch (levelBase(level)) {
    case "N1":
      return "幅広い場面で自然にやりとりできる";
    case "N2":
      return "日常＋やや複雑な会話も理解できる";
    case "N3":
      return "基本的な日常会話ができる";
    case "N4":
      return "簡単な会話・指示が理解できる";
    case "N5":
      return "あいさつ・基礎的な単語レベル";
    default:
      return "基礎前。ほとんど聞き取れない";
  }
}

/** 推定レベルに応じたアクセント色 (N2以上=緑, N3=青, N4=橙, それ以下=灰) */
function levelStyle(level: string | null): { bg: string; text: string; border: string } {
  const b = levelBase(level);
  if (b === "N1" || b === "N2") return { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" };
  if (b === "N3") return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
  if (b === "N4") return { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" };
  return { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" };
}

/** スコア(1〜5)を定性ラベルと色に */
function scoreLabel(v: number | null): { text: string; color: string } {
  if (v == null) return { text: "—", color: "#9CA3AF" };
  if (v >= 5) return { text: "とても良い", color: "#15803D" };
  if (v >= 4) return { text: "良い", color: "#16A34A" };
  if (v >= 3) return { text: "普通", color: "#2563EB" };
  if (v >= 2) return { text: "やや弱い", color: "#D97706" };
  return { text: "弱い", color: "#DC2626" };
}

export default function JapaneseCheckPanel({
  personId,
  initial,
}: {
  personId: number;
  initial: JapaneseCheckView | null;
}) {
  const [data, setData] = useState<JapaneseCheckView | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // まだ一度も録音されていない → 折りたたみ不要の最小表示
  if (!data) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">日本語チェック</p>
          <span className="text-[12px] text-gray-400">未実施</span>
        </div>
        <p className="mt-1.5 text-[12px] text-gray-500">
          フォームの最後で候補者が 3 問を録音すると、AI が日本語レベルを判定します。
        </p>
      </section>
    );
  }

  const assessed = Boolean(data.assessedAt);
  const lv = levelStyle(data.estimatedLevel);
  const base = levelBase(data.estimatedLevel);

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

  const scores = [
    { key: "pronunciation", label: "発音", value: data.pronunciation },
    { key: "fluency", label: "流暢さ", value: data.fluency },
    { key: "vocabulary", label: "語彙", value: data.vocabulary },
    { key: "grammar", label: "文法", value: data.grammar },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* 折りたたみヘッダー (常に表示 = 最低限) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">日本語チェック</span>
          {assessed ? (
            <span
              className="rounded-full border px-3 py-0.5 text-sm font-bold"
              style={{ backgroundColor: lv.bg, color: lv.text, borderColor: lv.border }}
            >
              {data.estimatedLevel ?? "—"}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-0.5 text-[12px] font-medium text-amber-700">
              判定待ち
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[12px] text-gray-400">
          {open ? "閉じる" : "詳細を見る"}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* 展開部 */}
      {open ? (
        <div className="border-t border-gray-100 bg-[#FBFCFE] px-5 py-5">
          {!assessed ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>録音は保存済みですが、AI 判定が未完了です。</span>
              <button
                type="button"
                onClick={() => void rejudge()}
                disabled={busy}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "判定中..." : "再判定する"}
              </button>
            </div>
          ) : null}

          {assessed ? (
            <>
              {/* レベル: ラダー + 意味 */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400">推定レベル</p>
                    <p className="mt-0.5 text-3xl font-bold leading-none" style={{ color: lv.text }}>
                      {data.estimatedLevel ?? "—"}
                    </p>
                  </div>
                  <p className="text-[13px] text-gray-500">{levelMeaning(data.estimatedLevel)}</p>
                </div>
                <LevelLadder base={base} accent={lv.text} />
              </div>

              {/* スコア: レーダー + 定性リスト */}
              <div className="mt-4 grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-[minmax(0,200px)_1fr]">
                <div className="flex items-center justify-center">
                  <RadarChart values={scores.map((s) => s.value ?? 0)} accent={lv.text} />
                </div>
                <div className="grid content-center gap-2.5">
                  {scores.map((s) => {
                    const q = scoreLabel(s.value);
                    return (
                      <div key={s.key} className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-[13px] font-semibold text-gray-700">
                          {s.label}
                        </span>
                        <span className="flex flex-1 items-center gap-1" aria-hidden>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span
                              key={i}
                              className="h-2 flex-1 rounded-full"
                              style={{
                                backgroundColor:
                                  s.value != null && i <= s.value ? q.color : "#E5E7EB",
                              }}
                            />
                          ))}
                        </span>
                        <span
                          className="w-16 shrink-0 text-right text-[12px] font-bold"
                          style={{ color: q.color }}
                        >
                          {q.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 総合所見 */}
              {data.summary ? (
                <div className="mt-4 flex gap-3 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-light)] p-4">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[var(--color-primary)]">総合所見（AI）</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-dark)]">
                      {data.summary}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* 各設問の文字起こし + 録音再生 */}
          {data.recordings.length > 0 ? (
            <div className="mt-4 space-y-2.5">
              <p className="text-[11px] font-semibold text-gray-400">録音と文字起こし</p>
              {data.recordings.map((r, idx) => (
                <div key={r.key} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-500">
                      {idx + 1}
                    </span>
                    <span className="text-[12px] font-medium text-gray-500">
                      {r.question || r.key}
                    </span>
                  </div>
                  <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2">
                    {r.transcript ? (
                      <p className="text-sm leading-relaxed text-[var(--color-text-dark)]">
                        {r.transcript}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">（文字起こしなし）</p>
                    )}
                  </div>
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

          {/* フッター: 判定日時 + 再判定 */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400">
              {assessed && data.assessedAt
                ? `判定日時 ${new Date(data.assessedAt).toLocaleString("ja-JP")}`
                : note ?? ""}
            </p>
            {assessed ? (
              <button
                type="button"
                onClick={() => void rejudge()}
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? "判定中..." : "再判定"}
              </button>
            ) : null}
          </div>
          {assessed && note ? (
            <p className="mt-2 text-right text-[11px] text-gray-500">{note}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** N5→N1 のラダー。現在レベルを強調 */
function LevelLadder({
  base,
  accent,
}: {
  base: (typeof LEVEL_LADDER)[number] | null;
  accent: string;
}) {
  const currentIdx = base ? LEVEL_LADDER.indexOf(base) : -1;
  return (
    <div className="mt-3">
      <div className="flex gap-1.5">
        {LEVEL_LADDER.map((lvl, i) => {
          const isCurrent = i === currentIdx;
          const reached = currentIdx >= 0 && i <= currentIdx;
          return (
            <div key={lvl} className="flex-1 text-center">
              <div
                className="h-2 rounded-full"
                style={{ backgroundColor: reached ? accent : "#E5E7EB" }}
              />
              <span
                className={`mt-1 inline-block text-[11px] ${isCurrent ? "font-bold" : "font-medium"}`}
                style={{ color: isCurrent ? accent : "#9CA3AF" }}
              >
                {lvl}
                {isCurrent ? " ▲" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-gray-300">
        <span>やさしい</span>
        <span>難しい</span>
      </div>
    </div>
  );
}

/** 4 観点 (発音/流暢さ/語彙/文法) のレーダーチャート。値は 0〜5 */
function RadarChart({ values, accent }: { values: number[]; accent: string }) {
  const size = 176;
  const c = size / 2;
  const R = 62;
  const labels = ["発音", "流暢さ", "語彙", "文法"];
  // 上・右・下・左
  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  const pt = (i: number, r: number) => ({
    x: c + dirs[i].x * r,
    y: c + dirs[i].y * r,
  });
  const ringPoints = (r: number) =>
    dirs.map((_, i) => { const p = pt(i, r); return `${p.x},${p.y}`; }).join(" ");
  const dataPoints = values
    .map((v, i) => { const p = pt(i, (R * Math.max(0, Math.min(5, v))) / 5); return `${p.x},${p.y}`; })
    .join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="4観点スコア">
      {/* グリッド (1〜5 のリング) */}
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon
          key={ring}
          points={ringPoints((R * ring) / 5)}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={1}
        />
      ))}
      {/* 軸 */}
      {dirs.map((_, i) => {
        const p = pt(i, R);
        return <line key={i} x1={c} y1={c} x2={p.x} y2={p.y} stroke="#E5E7EB" strokeWidth={1} />;
      })}
      {/* データ多角形 */}
      <polygon points={dataPoints} fill={accent} fillOpacity={0.18} stroke={accent} strokeWidth={2} />
      {values.map((v, i) => {
        const p = pt(i, (R * Math.max(0, Math.min(5, v))) / 5);
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill={accent} />;
      })}
      {/* ラベル */}
      {labels.map((label, i) => {
        const p = pt(i, R + 12);
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            fill="#6B7280"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
