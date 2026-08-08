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

/** 判定の根拠 (lib/japanese-check.ts が保存した観察データ) */
export type JapaneseCheckEvidence = {
  perQuestion?: {
    key?: string;
    question?: string;
    focus?: string;
    transcript?: string;
    audioIssue?: string;
    intelligibility?: number;
    taskAchieved?: string;
    grammarErrorCount?: number;
    grammarErrorExamples?: string[];
    hesitationCount?: number;
    vocabLevel?: number;
    readingAccuracy?: number | null;
    mora?: number;
    seconds?: number | null;
    moraPerSec?: number | null;
    usable?: boolean;
  }[];
  metrics?: {
    usableCount?: number;
    totalQuestions?: number;
    intelligibilityAvg?: number;
    readingAccuracy?: number | null;
    freeMoraTotal?: number;
    moraPerSecAvg?: number | null;
    grammarErrorPer100Mora?: number | null;
    hesitationPer100Mora?: number | null;
    achievementRate?: number;
    composite?: number;
  };
  appliedRules?: string[];
} | null;

export type JapaneseCheckView = {
  estimatedLevel: string | null;
  pronunciation: number | null;
  fluency: number | null;
  vocabulary: number | null;
  grammar: number | null;
  summary: string | null;
  /** なぜこのレベルになったかのルールの足あと */
  levelReason?: string | null;
  /** 判定の確からしさ (高/中/低) */
  confidence?: string | null;
  evidence?: JapaneseCheckEvidence;
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
          上部のマイクのボタンから専用リンクを送り、候補者が 5 問を録音すると判定されます。
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
              <span>
                録音は保存済みです。AI 判定は送信の 1 分ほど後に自動で終わります（画面を再読み込みすると反映）。
                時間が経っても変わらない場合は「再判定する」を押してください。
              </span>
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
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-3xl font-bold leading-none" style={{ color: lv.text }}>
                        {data.estimatedLevel ?? "—"}
                      </p>
                      {data.confidence ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            data.confidence === "高"
                              ? "bg-[#DCFCE7] text-[#15803D]"
                              : data.confidence === "中"
                                ? "bg-[#FEF3C7] text-[#92400E]"
                                : "bg-[#FEE2E2] text-[#B91C1C]"
                          }`}
                          title="判定に使えた録音の数で決まります"
                        >
                          確からしさ {data.confidence}
                        </span>
                      ) : null}
                    </div>
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
                    <p className="text-[12px] font-bold text-[var(--color-primary)]">総合所見</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-dark)]">
                      {data.summary}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* 判定の根拠 (AI は事実の観察のみ。レベルはルールで決まる) */}
              <EvidenceBlock levelReason={data.levelReason ?? null} evidence={data.evidence ?? null} />
            </>
          ) : null}

          {/* 各設問の文字起こし + 録音再生 */}
          {data.recordings.length > 0 ? (
            <div className="mt-4 space-y-2.5">
              <p className="text-[11px] font-semibold text-gray-400">録音と文字起こし</p>
              {data.recordings.map((r, idx) => {
                const fact = data.evidence?.perQuestion?.find((p) => p.key === r.key);
                return (
                  <div key={r.key} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-500">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-gray-600">
                          {(r.question || r.key).split(" / ")[0]}
                        </p>
                        {fact?.focus ? (
                          <p className="mt-0.5 text-[11px] text-gray-400">{fact.focus}</p>
                        ) : null}
                      </div>
                    </div>

                    {/* 録音の再生 (Drive はプライベートなので audio-proxy 経由) */}
                    {r.driveFileId ? (
                      <div className="mt-2.5">
                        <audio
                          controls
                          preload="metadata"
                          src={`/api/audio-proxy?id=${encodeURIComponent(r.driveFileId)}`}
                          className="w-full"
                          aria-label={`録音 ${idx + 1} の再生`}
                        >
                          お使いのブラウザは音声の再生に対応していません。
                        </audio>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                          <a
                            href={`/api/audio-proxy?id=${encodeURIComponent(r.driveFileId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            別タブで開く
                          </a>
                          {r.driveFileUrl ? (
                            <a
                              href={r.driveFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:underline"
                            >
                              Drive で開く
                            </a>
                          ) : null}
                          {fact?.seconds ? (
                            <span className="text-gray-400">{Math.round(fact.seconds)} 秒</span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-400">
                        音声ファイルが見つかりません（保存に失敗した可能性があります）
                      </p>
                    )}

                    <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2">
                      {r.transcript ? (
                        <p className="text-sm leading-relaxed text-[var(--color-text-dark)]">
                          {r.transcript}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400">（文字起こしなし）</p>
                      )}
                    </div>

                    {/* この問で観察された事実 */}
                    {fact ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {fact.usable === false ? (
                          <Chip tone="warn">
                            判定に不使用（
                            {fact.audioIssue === "silent"
                              ? "ほぼ無音"
                              : fact.audioIssue === "too_short"
                                ? "短すぎる"
                                : "聞き取れない"}
                            ）
                          </Chip>
                        ) : null}
                        {fact.taskAchieved ? (
                          <Chip
                            tone={
                              fact.taskAchieved === "full"
                                ? "ok"
                                : fact.taskAchieved === "partial"
                                  ? "warn"
                                  : "bad"
                            }
                          >
                            設問に
                            {fact.taskAchieved === "full"
                              ? "答えられている"
                              : fact.taskAchieved === "partial"
                                ? "部分的に回答"
                                : "答えていない"}
                          </Chip>
                        ) : null}
                        {typeof fact.intelligibility === "number" ? (
                          <Chip>聞き取れた割合 {fact.intelligibility}%</Chip>
                        ) : null}
                        {typeof fact.readingAccuracy === "number" ? (
                          <Chip>音読の正確さ {fact.readingAccuracy}%</Chip>
                        ) : null}
                        {typeof fact.moraPerSec === "number" ? (
                          <Chip>{fact.moraPerSec} 拍/秒</Chip>
                        ) : null}
                        {typeof fact.grammarErrorCount === "number" ? (
                          <Chip>文法の誤り {fact.grammarErrorCount} 件</Chip>
                        ) : null}
                        {typeof fact.hesitationCount === "number" && fact.hesitationCount > 0 ? (
                          <Chip>言い淀み {fact.hesitationCount} 回</Chip>
                        ) : null}
                      </div>
                    ) : null}

                    {fact?.grammarErrorExamples && fact.grammarErrorExamples.length > 0 ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                        誤りの例: {fact.grammarErrorExamples.join(" / ")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
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

/** 事実を表示する小さなラベル */
function Chip({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "ok" | "warn" | "bad";
}) {
  const style =
    tone === "ok"
      ? "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]"
      : tone === "warn"
        ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
        : tone === "bad"
          ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
          : "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${style}`}>
      {children}
    </span>
  );
}

/**
 * 判定の根拠ブロック。
 * この検査では AI は「聞こえた事実」だけを出し、レベルはコードのルールが決めている。
 * その計算に使われた数値と、適用された上限規則をそのまま開示する。
 */
function EvidenceBlock({
  levelReason,
  evidence,
}: {
  levelReason: string | null;
  evidence: JapaneseCheckEvidence;
}) {
  const [open, setOpen] = useState(false);
  const m = evidence?.metrics;
  if (!levelReason && !m) return null;

  const rows: { label: string; value: string }[] = [];
  if (m) {
    if (m.usableCount != null && m.totalQuestions != null)
      rows.push({ label: "判定に使えた録音", value: `${m.usableCount} / ${m.totalQuestions} 問` });
    if (m.intelligibilityAvg != null)
      rows.push({ label: "聞き取れた割合（平均）", value: `${m.intelligibilityAvg}%` });
    if (m.readingAccuracy != null)
      rows.push({ label: "音読の正確さ", value: `${m.readingAccuracy}%` });
    if (m.moraPerSecAvg != null)
      rows.push({ label: "話す速さ", value: `${m.moraPerSecAvg} 拍/秒` });
    if (m.freeMoraTotal != null)
      rows.push({ label: "自由発話の総量", value: `${m.freeMoraTotal} 拍` });
    if (m.grammarErrorPer100Mora != null)
      rows.push({ label: "文法の誤り", value: `100拍あたり ${m.grammarErrorPer100Mora} 回` });
    if (m.hesitationPer100Mora != null)
      rows.push({ label: "言い淀み", value: `100拍あたり ${m.hesitationPer100Mora} 回` });
    if (m.achievementRate != null)
      rows.push({ label: "設問に答えられた割合", value: `${Math.round(m.achievementRate * 100)}%` });
    if (m.composite != null)
      rows.push({ label: "重みづけ総合点", value: `${m.composite} / 5` });
  }

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
        aria-expanded={open}
      >
        <span className="text-[12px] font-bold text-gray-600">判定の根拠</span>
        <span className="flex items-center gap-1 text-[11px] text-gray-400">
          {open ? "閉じる" : "数値を見る"}
          <svg
            width="14"
            height="14"
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
      {open ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="rounded-xl bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-600">
            AI は音声から「聞こえた事実」を数えるだけで、レベルは決められた計算式が判定しています。
            同じ録音なら何度判定しても同じ結果になります。
          </p>

          {rows.length > 0 ? (
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-[11px] text-gray-400">{row.label}</dt>
                  <dd className="text-[12px] font-semibold tabular-nums text-gray-700">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {levelReason ? (
            <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] leading-relaxed text-gray-600">
              {levelReason}
            </p>
          ) : null}

          {evidence?.appliedRules && evidence.appliedRules.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-gray-400">適用されたルール</p>
              <ul className="mt-1 space-y-1">
                {evidence.appliedRules.map((rule, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-gray-600">
                    <span aria-hidden>・</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
