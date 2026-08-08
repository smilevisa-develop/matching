"use client";

import { useState } from "react";

import { PANEL_ACTION, usePanelActions } from "./PanelActions";

/**
 * 事前面談の準備パネル。
 * 履歴書取込 → 日本語チェック → フォーム送信 → 本人の回答 → 求人票確認
 * の 5 ステップの進行状況を候補者詳細の最上部に常設表示する。
 *
 * 日本語チェックと入力フォームは別のリンクなので、ステップも別々に置く。
 * 各ステップの判定はサーバー側 (page.tsx) で計算して props で受け取る。
 *
 * 各カードはそのままボタンで、クリックすると対応する操作が開く
 * (上部アイコンと同じモーダル。PanelActions 経由で呼び出す)。
 */
export type PreparationState = {
  /** Step1: 履歴書 (原本ファイル or AI 抽出) が取り込まれているか */
  resumeImported: boolean;
  /** AI 抽出で埋まっている主要項目数 (表示用) */
  extractedFieldCount: number;
  /** Step2: 日本語チェック (専用リンク) の状況 */
  japaneseCheckIssued: boolean;
  japaneseCheckToken: string | null;
  japaneseCheckRecorded: boolean;
  japaneseCheckLevel: string | null;
  /** Step3: intake フォーム URL 発行済みか */
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
  /** 最新配信のトークン (発行済みならカードにコピーボタンを出す) */
  checklistToken: string | null;
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
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistCopied, setChecklistCopied] = useState(false);
  const [jcCopied, setJcCopied] = useState(false);
  const panelActions = usePanelActions();

  const copyJapaneseCheckLink = async () => {
    if (!state.japaneseCheckToken) return;
    const url = `${window.location.origin}/japanese-check/${state.japaneseCheckToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setJcCopied(true);
      setTimeout(() => setJcCopied(false), 2000);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", url);
    }
  };

  const copyChecklistLink = async () => {
    if (!state.checklistToken) return;
    const url = `${window.location.origin}/checklist/${state.checklistToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setChecklistCopied(true);
      setTimeout(() => setChecklistCopied(false), 2000);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", url);
    }
  };

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
          onClick={() => panelActions?.trigger(PANEL_ACTION.extract)}
          pendingNote="クリックして履歴書を AI 取込み"
        />

        {/* Step 2: 日本語チェック (専用リンク) */}
        <StepCard
          done={state.japaneseCheckRecorded}
          active={state.resumeImported && !state.japaneseCheckRecorded}
          title="2. 日本語チェック"
          doneNote={`録音受信済み${state.japaneseCheckLevel ? ` ・ ${state.japaneseCheckLevel}` : ""}`}
          extra={
            state.japaneseCheckToken && !state.japaneseCheckRecorded ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyJapaneseCheckLink();
                }}
                className="mt-2 w-full rounded-lg border border-[var(--color-primary)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                {jcCopied ? "コピーしました" : "🔗 リンクをコピー"}
              </button>
            ) : null
          }
          onClick={() => panelActions?.trigger(PANEL_ACTION.japaneseCheck)}
          pendingNote={
            state.japaneseCheckIssued
              ? "リンク発行済み（録音待ち）"
              : "クリックしてリンクを発行"
          }
        />

        {/* Step 3: フォーム送信 */}
        <StepCard
          done={state.intakeIssued}
          active={state.japaneseCheckRecorded && !state.intakeIssued}
          title="3. フォーム送信"
          doneNote={`URL 発行済み ・ 必須 ${state.mustTotal} 問`}
          onClick={() => panelActions?.trigger(PANEL_ACTION.intakeForm)}
          pendingNote="クリックしてフォーム URL を発行"
        />

        {/* Step 4: 本人の回答 */}
        <StepCard
          done={step3Done}
          active={answering}
          title="4. 本人の回答"
          doneNote="全問回答済み"
          onClick={() => panelActions?.trigger(PANEL_ACTION.intakeForm)}
          pendingNote={
            state.intakeIssued
              ? `${state.mustAnswered} / ${state.mustTotal} 問 回答済み`
              : "フォーム送信後に表示"
          }
          extra={
            answering && state.intakeToken ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyRemind();
                }}
                className="mt-2 rounded-lg border border-[var(--color-primary)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                {copied ? "コピーしました" : "リマインド文をコピー"}
              </button>
            ) : null
          }
        />

        {/* Step 5: 求人票確認 (母国語チェックリスト) — クリックでポップアップ */}
        <StepCard
          done={state.checklistCompleted}
          active={step3Done && !state.checklistCompleted}
          title="5. 求人票確認"
          doneNote="候補者が確認済み"
          onClick={checklistContent ? () => setChecklistOpen(true) : undefined}
          extra={
            state.checklistToken ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyChecklistLink();
                }}
                className="mt-2 w-full rounded-lg border border-[var(--color-primary)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                {checklistCopied ? "コピーしました" : "🔗 リンクをコピー"}
              </button>
            ) : null
          }
          pendingNote={
            state.checklistCompleted
              ? "候補者が確認済み"
              : state.checklistSent
                ? state.checklistOpened
                  ? "送信済み・開封（確認待ち）"
                  : "送信済み（未開封）"
                : step3Done
                  ? "クリックして母国語チェックリストを送信"
                  : "本人の回答の後に送信"
          }
        />
      </div>

      {/* Step4 の操作 (母国語チェックリスト) はステップ4クリックでポップアップ表示 */}
      {checklistOpen && checklistContent ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onClick={() => setChecklistOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--color-text-dark)]">5. 求人票確認</p>
              <button
                type="button"
                onClick={() => setChecklistOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="閉じる"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {checklistContent}
          </div>
        </div>
      ) : null}

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
  onClick,
}: {
  done: boolean;
  active: boolean;
  title: string;
  doneNote: string;
  pendingNote: React.ReactNode;
  extra?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    // 中にコピーボタンを置くため <button> にはできない。
    // role/tabIndex/Enter・Space で同等に操作できるようにしておく。
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`rounded-xl border px-3 py-2.5 text-left ${
        onClick
          ? "cursor-pointer transition hover:border-[var(--color-primary)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
          : ""
      } ${
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



