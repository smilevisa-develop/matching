"use client";

import { useEffect, useState } from "react";
import CloseButton from "@/app/components/CloseButton";

/**
 * 企業の「事前確認資料」の登録パネル (企業ワークスペース内)。
 *
 * 内定後に企業から渡される資料 (会社の考え方・特定技能生ルールなど) を
 * ここで 1 度登録しておくと、候補者詳細からワンクリックで母国語配信できる。
 * たまにしか使わない機能なので、本文を貼り付けるだけの最小構成にしている。
 */

type DocumentRow = {
  id: number;
  title: string;
  sectionCount: number;
  checkCount: number;
  translatedLanguages: string[];
  deliveryCount: number;
  updatedAt: string;
};

const LANG_LABEL: Record<string, string> = {
  vi: "ベトナム語",
  id: "インドネシア語",
  my: "ミャンマー語",
  ne: "ネパール語",
};

export default function CompanyDocumentsPanel({ companyId }: { companyId: number }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: number; title: string } | null>(null);

  const load = () =>
    fetch(`/api/companies/${companyId}/documents`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setDocuments(d.documents as DocumentRow[]);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">事前確認資料</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            内定後に企業から渡される資料（会社の考え方・ルールなど）を登録すると、
            候補者に母国語で確認してもらえます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ title: "" })}
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          資料を登録
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">読み込み中...</p>
        ) : documents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            まだ資料が登録されていません
          </p>
        ) : (
          documents.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">{d.title}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {d.sectionCount} セクション（うち確認が必要 {d.checkCount}） ・ 送信 {d.deliveryCount} 件
                  {d.translatedLanguages.length > 0 ? (
                    <>
                      {" "}・ 翻訳済み{" "}
                      {d.translatedLanguages.map((l) => LANG_LABEL[l] ?? l).join(" / ")}
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing({ id: d.id, title: d.title })}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                差し替え
              </button>
            </div>
          ))
        )}
      </div>

      {editing ? (
        <DocumentEditor
          companyId={companyId}
          documentId={editing.id}
          initialTitle={editing.title}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setLoading(true);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function DocumentEditor({
  companyId,
  documentId,
  initialTitle,
  onClose,
  onSaved,
}: {
  companyId: number;
  documentId?: number;
  initialTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initialTitle || "事前確認資料");
  const [sourceText, setSourceText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sections: { key: string; title: string; kind: "read" | "check" }[];
    warning: string | null;
  } | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceText, documentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "登録に失敗しました");
        return;
      }
      setResult({ sections: data.document.sections, warning: data.warning ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <p className="text-sm font-bold text-[var(--color-text-dark)]">
            {documentId ? "資料を差し替え" : "事前確認資料を登録"}
          </p>
          <CloseButton onClick={onClose} />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {result ? (
            <>
              <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
                <p className="text-sm font-semibold text-[#15803D]">
                  ✓ {result.sections.length} セクションに分割しました
                </p>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  候補者に送るときに、母国語へ自動で翻訳されます。
                </p>
              </div>
              {result.warning ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
                  {result.warning}
                </p>
              ) : null}
              <ol className="space-y-1.5">
                {result.sections.map((s, i) => (
                  <li
                    key={s.key}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-dark)]">
                      {s.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        s.kind === "check"
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {s.kind === "check" ? "要チェック" : "読むだけ"}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">資料名</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                  placeholder="特定技能生 事前確認資料"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  資料の本文（Word などからそのまま貼り付け）
                </label>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={14}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-[12px] leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                  placeholder={"ご縁をいただく皆さんへ\n当社で働くうえで大切にしている考え方をお伝えします。\n\n① お客様を一番大切にします\n..."}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  見出しごとに自動でセクションに分けます。会社の考え方は「読むだけ」、
                  ルールや金額は「要チェック」に自動で分類されます（{sourceText.length} 文字）。
                </p>
              </div>
              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {result ? (
            <button
              type="button"
              onClick={onSaved}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              完了
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || sourceText.trim().length < 50}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {saving ? "分割中..." : "登録して分割"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
