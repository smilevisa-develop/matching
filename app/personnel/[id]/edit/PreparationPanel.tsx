"use client";

import { useState } from "react";

/**
 * 事前面談の準備パネル。
 * 履歴書取込 → フォーム送信 → 本人の回答 → 面談 の 4 ステップの進行状況を
 * 候補者詳細の最上部に常設表示する。
 *
 * 各ステップの判定はサーバー側 (page.tsx) で計算して props で受け取る。
 */
export type PreparationState = {
  /** Step1: 履歴書 (原本ファイル or AI 抽出) が取り込まれているか */
  resumeImported: boolean;
  /** AI 抽出で埋まっている主要項目数 (表示用) */
  extractedFieldCount: number;
  /** Step2: intake フォーム URL 発行済みか */
  intakeIssued: boolean;
  intakeToken: string | null;
  /** Step3: 必須質問の回答状況 */
  mustTotal: number;
  mustAnswered: number;
  /** 未回答の必須質問ラベル (最大 5 件に切って渡す) */
  unansweredLabels: string[];
  /** Step4: 母国語チェックリストの状況 */
  checklistSent: boolean;
  checklistOpened: boolean;
  checklistCompleted: boolean;
};

export default function PreparationPanel({
  personName,
  state,
  checklistContent,
}: {
  personName: string;
  state: PreparationState;
  /** Step4 (求人票確認) の操作 UI をパネル内に埋め込む */
  checklistContent?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const step3Done = state.mustTotal > 0 && state.mustAnswered >= state.mustTotal;
  const answering = state.intakeIssued && !step3Done;

  const copyRemind = async () => {
    if (!state.intakeToken) return;
    const url = `${window.location.origin}/intake/${state.intakeToken}`;
    const text =
      `${personName} さん、こんにちは。SMILEVISA です。\n` +
      `面談の前に、こちらのフォームへのご回答をお願いします (5分くらいで終わります)。\n` +
      `Please answer this form before the interview (about 5 minutes).\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", text);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">事前面談の準備</p>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {/* Step 1: 履歴書取込 */}
        <StepCard
          done={state.resumeImported}
          active={!state.resumeImported}
          title="1. 履歴書取込"
          doneNote={`AI 読み取り済み${state.extractedFieldCount > 0 ? ` ・ ${state.extractedFieldCount} 項目` : ""}`}
          pendingNote={
            <>
              上の <SparkleChip /> ボタンから履歴書を AI 取込み
            </>
          }
        />

        {/* Step 2: フォーム送信 */}
        <StepCard
          done={state.intakeIssued}
          active={state.resumeImported && !state.intakeIssued}
          title="2. フォーム送信"
          doneNote={`URL 発行済み ・ 必須 ${state.mustTotal} 問`}
          pendingNote={
            <>
              上の <PaperPlaneChip /> ボタンからフォーム URL を発行
            </>
          }
        />

        {/* Step 3: 本人の回答 */}
        <StepCard
          done={step3Done}
          active={answering}
          title="3. 本人の回答"
          doneNote="全問回答済み"
          pendingNote={
            state.intakeIssued
              ? `${state.mustAnswered} / ${state.mustTotal} 問 回答済み`
              : "フォーム送信後に表示"
          }
          extra={
            answering && state.intakeToken ? (
              <button
                type="button"
                onClick={() => void copyRemind()}
                className="mt-2 rounded-lg border border-[var(--color-primary)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                {copied ? "コピーしました" : "リマインド文をコピー"}
              </button>
            ) : null
          }
        />

        {/* Step 4: 求人票確認 (母国語チェックリスト) */}
        <StepCard
          done={state.checklistCompleted}
          active={step3Done && !state.checklistCompleted}
          title="4. 求人票確認"
          doneNote="候補者が確認済み"
          pendingNote={
            state.checklistCompleted
              ? "候補者が確認済み"
              : state.checklistSent
                ? state.checklistOpened
                  ? "送信済み・開封（確認待ち）"
                  : "送信済み（未開封）"
                : step3Done
                  ? "下から母国語チェックリストを送信"
                  : "本人の回答の後に送信"
          }
        />

        {/* Step 5: 面談へ */}
        <StepCard
          done={false}
          active={step3Done}
          title="5. 面談へ"
          doneNote=""
          pendingNote={step3Done ? "準備完了。面談に進めます" : "全問回答で準備完了"}
        />
      </div>

      {/* Step4 の操作 (母国語チェックリスト) をパネル内に埋め込む */}
      {checklistContent ? <div className="mt-3 border-t border-gray-100 pt-3">{checklistContent}</div> : null}

      {/* 未回答の必須質問 */}
      {state.intakeIssued && !step3Done && state.unansweredLabels.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-[11px] text-gray-500">未回答:</span>
          {state.unansweredLabels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-medium text-[#92400E]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StepCard({
  done,
  active,
  title,
  doneNote,
  pendingNote,
  extra,
}: {
  done: boolean;
  active: boolean;
  title: string;
  doneNote: string;
  pendingNote: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        done
          ? "border-[#BBF7D0] bg-[#F0FDF4]"
          : active
            ? "border-2 border-[var(--color-primary)] bg-white"
            : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {done ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span
            className={`inline-block h-2 w-2 rounded-full ${active ? "bg-[var(--color-primary)]" : "bg-gray-300"}`}
          />
        )}
        <span
          className={`text-[12px] font-semibold ${
            done ? "text-[#15803D]" : active ? "text-[var(--color-primary)]" : "text-gray-400"
          }`}
        >
          {title}
        </span>
      </div>
      <p className={`mt-1 text-[11px] ${done ? "text-[#166534]" : active ? "text-gray-600" : "text-gray-400"}`}>
        {done ? doneNote : pendingNote}
      </p>
      {extra}
    </div>
  );
}

/** 実際の「AI 取込」ボタン (グラデ枠 + スパークル) を小さく再現 */
function SparkleChip() {
  return (
    <span className="mx-0.5 inline-flex h-[18px] w-[18px] translate-y-[3px] items-center justify-center rounded-md bg-gradient-to-br from-[#A78BFA] via-[#F472B6] to-[#F59E0B] text-white shadow-sm align-baseline">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill="currentColor" />
        <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" fill="currentColor" />
        <path d="M5 16l.6 1.6L7.2 18l-1.6.4L5 20l-.6-1.6L2.8 18l1.6-.4L5 16z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** 実際の「フォーム送信」ボタン (白地 + 紙飛行機) を小さく再現 */
function PaperPlaneChip() {
  return (
    <span className="mx-0.5 inline-flex h-[18px] w-[18px] translate-y-[3px] items-center justify-center rounded-md border border-gray-200 bg-white text-[var(--color-primary)] shadow-sm align-baseline">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    </span>
  );
}
