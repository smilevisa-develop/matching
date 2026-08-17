"use client";

import { useEffect, useState } from "react";
import { CHECKLIST_LANGUAGES } from "@/lib/job-checklist";

/**
 * 候補者詳細の「事前確認資料」パネル。
 *
 * 内定後に企業から渡された資料を母国語で送り、
 *   開封したか / どこまで確認したか / どこが「わからない」か
 * を追う。面談で説明すべき箇所がそのまま分かるのが狙い。
 */

type DocumentOption = { id: number; title: string; sectionCount: number };

type Delivery = {
  id: number;
  token: string;
  language: string;
  documentTitle: string;
  totalCheckItems: number;
  checkedCount: number;
  unclearSections: { key: string; title: string }[];
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
};

const LANG_LABEL: Record<string, string> = {
  vi: "ベトナム語",
  id: "インドネシア語",
  my: "ミャンマー語",
  ne: "ネパール語",
};

export default function DocumentCheckPanel({
  personId,
  defaultLanguage,
}: {
  personId: number;
  /** 国籍から推定した既定の母国語 */
  defaultLanguage: string;
}) {
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentId, setDocumentId] = useState<string>("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const load = () =>
    fetch(`/api/personnel/${personId}/document-check`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setDocuments(d.documents as DocumentOption[]);
        setDeliveries(d.deliveries as Delivery[]);
        if (!documentId && d.documents.length > 0) setDocumentId(String(d.documents[0].id));
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const issue = async () => {
    if (!documentId) return;
    setBusy(true);
    setNote("リンクを作成しています…（初回は翻訳のため 30 秒ほどかかります）");
    try {
      const res = await fetch(`/api/personnel/${personId}/document-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: Number(documentId), language }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setNote(`作成に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      setNote(null);
      await load();
    } catch (e) {
      setNote(`作成に失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (delivery: Delivery) => {
    const url = `${window.location.origin}/document-check/${delivery.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(delivery.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("コピーできませんでした。以下を手動でコピーしてください:", url);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          事前確認資料（内定後）
        </p>
        {deliveries.length > 0 ? (
          <span className="text-[11px] text-gray-400">送信 {deliveries.length} 件</span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-center text-sm text-gray-400">読み込み中...</p>
      ) : documents.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
          この候補者の推薦先企業に、まだ資料が登録されていません。
          <br />
          企業ページの「事前確認資料」から、企業から届いた資料を貼り付けて登録してください。
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[12px] text-gray-500">
            企業の資料を母国語に訳して送り、理解できたかを確認します。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">資料</label>
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}（{d.sectionCount} セクション）
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">言語</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              >
                {CHECKLIST_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void issue()}
              disabled={busy || !documentId}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {busy ? "作成中..." : "リンクを作成"}
            </button>
          </div>
          {note ? <p className="mt-2 text-[11px] text-gray-500">{note}</p> : null}
        </>
      )}

      {/* 送信済みの状況 */}
      {deliveries.length > 0 ? (
        <div className="mt-4 space-y-2.5 border-t border-gray-100 pt-3">
          {deliveries.map((d) => (
            <div key={d.id} className="rounded-2xl border border-gray-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text-dark)]">
                    {d.documentTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {LANG_LABEL[d.language] ?? d.language} ・{" "}
                    {d.completedAt
                      ? `全項目を確認済み（${new Date(d.completedAt).toLocaleDateString("ja-JP")}）`
                      : d.openedAt
                        ? `開封済み ・ ${d.checkedCount} / ${d.totalCheckItems} 項目`
                        : "未開封"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyLink(d)}
                  className="shrink-0 rounded-lg border border-[var(--color-primary)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                >
                  {copied === d.id ? "コピーしました" : "🔗 リンクをコピー"}
                </button>
              </div>

              {/* 進捗バー */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all"
                  style={{
                    width: `${d.totalCheckItems ? (d.checkedCount / d.totalCheckItems) * 100 : 0}%`,
                  }}
                />
              </div>

              {/* 面談で説明すべき箇所 */}
              {d.unclearSections.length > 0 ? (
                <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-amber-800">
                    候補者が「わからない」と答えた箇所（{d.unclearSections.length} 件）
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {d.unclearSections.map((s) => (
                      <li key={s.key} className="flex gap-1.5 text-[12px] text-amber-900">
                        <span aria-hidden>・</span>
                        <span>{s.title}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-amber-700">
                    面談でここを説明してください。
                  </p>
                </div>
              ) : d.openedAt ? (
                <p className="mt-2 text-[11px] text-gray-400">
                  「わからない」の申告はありません
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
