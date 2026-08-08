"use client";

import { useEffect, useState } from "react";
import CloseButton from "@/app/components/CloseButton";
import IconAction from "./IconAction";
import { PANEL_ACTION, usePanelActions } from "./PanelActions";
import { JAPANESE_CHECK_QUESTIONS } from "@/lib/japanese-check-questions";

/**
 * 日本語チェック専用リンクの発行・送付ボタン (マイクアイコン)。
 * 入力フォーム (紙飛行機) とは完全に別のリンクなので、片方だけ再発行できる。
 */

type LinkState = {
  token: string | null;
  path: string | null;
  recorded: boolean;
  recordingCount: number;
  assessed: boolean;
  estimatedLevel: string | null;
  submittedAt: string | null;
};

export default function JapaneseCheckLinkButton({
  personId,
  personName,
}: {
  personId: number;
  personName: string;
}) {
  const [open, setOpen] = useState(false);

  // 準備パネルの「2. 日本語チェック」からも開けるようにする
  const panelActions = usePanelActions();
  useEffect(
    () => panelActions?.register(PANEL_ACTION.japaneseCheck, () => setOpen(true)),
    [panelActions],
  );

  return (
    <>
      <IconAction
        label="日本語"
        title="日本語チェック (録音) のリンクを発行"
        onClick={() => setOpen(true)}
      >
        <MicIcon />
      </IconAction>
      {open ? (
        <JapaneseCheckLinkModal
          personId={personId}
          personName={personName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function JapaneseCheckLinkModal({
  personId,
  personName,
  onClose,
}: {
  personId: number;
  personName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState<"url" | "message" | null>(null);

  useEffect(() => {
    void fetch(`/api/personnel/${personId}/japanese-check-link`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setState(d as LinkState);
      })
      .finally(() => setLoading(false));
  }, [personId]);

  const url = state?.path ? `${window.location.origin}${state.path}` : null;

  const issue = async (regenerate = false) => {
    setIssuing(true);
    try {
      const res = await fetch(
        `/api/personnel/${personId}/japanese-check-link${regenerate ? "?regenerate=1" : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`発行失敗: ${data.error ?? res.statusText}`);
        return;
      }
      setState(data as LinkState);
    } finally {
      setIssuing(false);
    }
  };

  const copy = async (text: string, kind: "url" | "message") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", text);
    }
  };

  const messageText = url
    ? `${personName} さん、こんにちは。SMILEVISA です。\n` +
      `面談の前に、日本語のかんたんなチェックをお願いします。\n` +
      `${JAPANESE_CHECK_QUESTIONS.length} つの質問に声で答えるだけです（5分くらい）。\n` +
      `Please complete this short Japanese check before the interview (about 5 minutes).\n${url}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <p className="text-sm font-bold text-[var(--color-text-dark)]">
            🎙️ 日本語チェック（録音）
          </p>
          <CloseButton onClick={onClose} />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-center text-sm text-gray-400">読み込み中...</p>
          ) : (
            <>
              {/* 実施状況 */}
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  state?.assessed
                    ? "border-[#BBF7D0] bg-[#F0FDF4]"
                    : state?.recorded
                      ? "border-amber-200 bg-amber-50"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  実施状況
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-text-dark)]">
                  {state?.assessed
                    ? `判定済み ・ ${state.estimatedLevel ?? "—"}`
                    : state?.recorded
                      ? `録音 ${state.recordingCount} 件を受信（判定待ち）`
                      : "未実施（まだ録音が届いていません）"}
                </p>
                {state?.submittedAt ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    最終受信 {new Date(state.submittedAt).toLocaleString("ja-JP")}
                  </p>
                ) : null}
              </div>

              {/* 何を聞くか */}
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                  質問（{JAPANESE_CHECK_QUESTIONS.length} 問・固定）
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  やさしい順に並んでいます。各問で見ている力が違うため、5 問すべての結果を突き合わせて判定します。
                </p>
                <ol className="mt-2 space-y-1.5">
                  {JAPANESE_CHECK_QUESTIONS.map((q, i) => (
                    <li
                      key={q.key}
                      className="flex gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] text-[var(--color-text-dark)]">
                          {q.prompt.split(" / ")[0]}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-gray-400">{q.focus}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* リンク */}
              {url ? (
                <div className="rounded-2xl border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3">
                  <p className="text-[11px] font-semibold text-[#15803D]">✓ リンクを発行済み</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-gray-700">{url}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copy(url, "url")}
                      className="rounded-lg border border-[var(--color-primary)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                    >
                      {copied === "url" ? "コピー完了" : "URL をコピー"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copy(messageText, "message")}
                      className="rounded-lg border border-[var(--color-primary)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                    >
                      {copied === "message" ? "コピー完了" : "送付文をコピー"}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      プレビュー
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm("リンクを再発行すると、旧リンクは使えなくなります。よろしいですか?")
                        ) {
                          void issue(true);
                        }
                      }}
                      className="text-[10px] text-gray-500 hover:underline"
                    >
                      再発行
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-400">
                  まだリンクを発行していません
                </p>
              )}
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
          {!url ? (
            <button
              type="button"
              onClick={() => void issue(false)}
              disabled={issuing}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {issuing ? "発行中..." : "リンクを発行"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
