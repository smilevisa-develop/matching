"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 候補者が見る 母国語＋日本語の対訳 求人票チェックリスト (公開ページ)。
 * 各項目を読んで「確認しました」にチェック → 保存。全部チェックで完了。
 */

export type ChecklistItemView = {
  key: string;
  jaLabel: string;
  jaValue: string;
  trLabel: string;
  trValue: string;
};

export default function ChecklistView({
  token,
  companyName,
  items,
  initialChecked,
}: {
  token: string;
  companyName: string;
  items: ChecklistItemView[];
  initialChecked: Record<string, boolean>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecked);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const openedRef = useRef(false);

  // 開封を記録 (初回のみ)
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void fetch(`/api/checklist/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open" }),
    }).catch(() => {});
  }, [token]);

  const allChecked = items.length > 0 && items.every((i) => checked[i.key]);

  const save = async (next: Record<string, boolean>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/checklist/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", checkedItems: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setSavedNote(data.completed ? "すべて確認しました / Done" : "保存しました");
        setTimeout(() => setSavedNote(null), 2000);
      }
    } catch {
      // 次回チェック時に再送されるので握りつぶす
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void save(next);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--color-light)] py-6 px-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">
            SMILE MATCHING
          </p>
          <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">
            求人の確認 / Job details
          </h1>
          <p className="mt-1 text-sm text-gray-600">{companyName}</p>
          <p className="mt-2 text-xs text-gray-500">
            下の内容を読んで、理解したら各項目にチェックしてください。<br />
            Please read and check each item.
          </p>
          {/* 進捗 */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{
                width: `${items.length ? (items.filter((i) => checked[i.key]).length / items.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {items.map((item) => {
          const on = Boolean(checked[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                on ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                    on ? "border-[#16A34A] bg-[#16A34A] text-white" : "border-gray-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {on ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  {/* 母国語 (大きく) */}
                  <p className="text-[13px] font-semibold text-[var(--color-primary)]">{item.trLabel}</p>
                  <p className="mt-0.5 text-base leading-relaxed text-[var(--color-text-dark)]">
                    {item.trValue}
                  </p>
                  {/* 日本語 (対訳) */}
                  <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] font-medium text-gray-400">
                    {item.jaLabel}
                  </p>
                  <p className="text-[13px] leading-relaxed text-gray-500">{item.jaValue}</p>
                </div>
              </div>
            </button>
          );
        })}

        <div className="rounded-2xl bg-white p-5 text-center shadow-md">
          {allChecked ? (
            <p className="text-sm font-semibold text-[#15803D]">
              すべて確認できました。ありがとうございました。<br />
              All checked. Thank you!
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              残り {items.filter((i) => !checked[i.key]).length} 項目
            </p>
          )}
          {saving ? <p className="mt-1 text-[11px] text-gray-400">保存中…</p> : null}
          {savedNote ? <p className="mt-1 text-[11px] text-[#15803D]">{savedNote}</p> : null}
        </div>
      </div>
    </div>
  );
}
