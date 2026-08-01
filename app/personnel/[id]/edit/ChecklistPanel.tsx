"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 母国語 求人票チェックリストの作成・送信パネル (候補者詳細)。
 *
 * 前提: 推薦先企業が選択済み ＋ その企業に求人情報がある。
 * 満たさなければ送信ボタンを無効化し理由を表示。
 * 送信すると母国語に翻訳した対訳チェックリストの公開URLを発行する。
 */

export type ChecklistDeliveryView = {
  id: number;
  language: string;
  token: string;
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
};

const LANG_OPTIONS = [
  { code: "vi", label: "ベトナム語" },
  { code: "id", label: "インドネシア語" },
  { code: "my", label: "ミャンマー語" },
  { code: "ne", label: "ネパール語" },
];

function langLabel(code: string): string {
  return LANG_OPTIONS.find((l) => l.code === code)?.label ?? code;
}

export default function ChecklistPanel({
  personId,
  recommendedCompany,
  companyHasJobInfo,
  defaultLanguage,
  deliveries,
  embedded = false,
}: {
  personId: number;
  recommendedCompany: string | null;
  companyHasJobInfo: boolean;
  defaultLanguage: string;
  deliveries: ChecklistDeliveryView[];
  /** 準備パネル内に埋め込む場合 true (外枠・大見出しを省く) */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState(defaultLanguage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasCompany = Boolean(recommendedCompany && recommendedCompany.trim());
  const blockedReason = !hasCompany
    ? "先に「推薦先企業」を選択してください。"
    : !companyHasJobInfo
      ? "推薦先企業の求人情報（仕事内容・給料など）が未入力です。企業の求人で条件を入力してください。"
      : null;

  const send = async () => {
    setBusy(true);
    setError(null);
    setIssuedUrl(null);
    try {
      const res = await fetch(`/api/personnel/${personId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "作成に失敗しました");
        return;
      }
      setIssuedUrl(`${window.location.origin}${data.path}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", url);
    }
  };

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper className={embedded ? "" : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"}>
      {embedded ? (
        <p className="text-[12px] font-semibold text-[var(--color-text-dark)]">
          🌐 求人票の確認（母国語チェックリスト）
        </p>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">母国語の求人票チェックリスト</p>
      )}
      <p className="mt-1 text-[12px] text-gray-500">
        求人票の要点を母国語＋日本語の対訳にして候補者に送り、確認（チェック）してもらいます。
      </p>

      {blockedReason ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {blockedReason}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-gray-500">言語</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        >
          {LANG_OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || Boolean(blockedReason)}
          className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "作成中…（翻訳しています）" : "チェックリストを作成・URL発行"}
        </button>
      </div>

      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}

      {issuedUrl ? (
        <div className="mt-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
          <p className="text-[12px] font-medium text-[#15803D]">URL を発行しました（候補者に送ってください）</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              readOnly
              value={issuedUrl}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-600"
            />
            <button
              type="button"
              onClick={() => void copy(issuedUrl)}
              className="shrink-0 rounded-lg border border-[var(--color-primary)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      ) : null}

      {/* 送信履歴・追跡 */}
      {deliveries.length > 0 ? (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold text-gray-400">送信履歴</p>
          <ul className="mt-2 space-y-2">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                  {langLabel(d.language)}
                </span>
                <span className="text-gray-400">
                  {d.sentAt ? new Date(d.sentAt).toLocaleString("ja-JP") : "-"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    d.completedAt
                      ? "bg-[#DCFCE7] text-[#15803D]"
                      : d.openedAt
                        ? "bg-[#DBEAFE] text-[#1D4ED8]"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {d.completedAt ? "チェック完了" : d.openedAt ? "開封済み" : "未開封"}
                </span>
                <button
                  type="button"
                  onClick={() => void copy(`${window.location.origin}/checklist/${d.token}`)}
                  className="text-[11px] text-[var(--color-primary)] hover:underline"
                >
                  URLコピー
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Wrapper>
  );
}
