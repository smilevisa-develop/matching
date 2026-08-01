"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DealOption = {
  id: number;
  title: string;
  companyName: string;
  /** 補助情報 (例: 候補者数) を表示したい場合 */
  hint?: string | null;
};

/**
 * 求人選択用の検索コンボボックス。会社名 / 求人名 / ID で絞り込み。
 */
export default function DealPicker({
  deals,
  selectedId,
  onSelect,
  placeholder = "会社名・求人名・ID で検索",
  className,
}: {
  deals: DealOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = deals.find((d) => String(d.id) === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) => {
      const idStr = String(d.id);
      if (idStr === q || idStr.startsWith(q)) return true;
      const hay = [d.companyName, d.title].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [deals, query]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const baseInput =
    "flex cursor-text items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30";

  const displayValue = open
    ? query
    : selected
      ? `${selected.companyName} / ${selected.title}`
      : query;

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <div className={baseInput} onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none"
        />
        {selected && !open ? (
          <button
            type="button"
            aria-label="選択をクリア"
            onClick={(e) => {
              e.stopPropagation();
              onSelect("");
              setQuery("");
            }}
            className="rounded-full px-1.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">
              {query ? `「${query}」に一致する求人がいません` : "求人がありません"}
            </p>
          ) : (
            filtered.map((deal) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => {
                  onSelect(String(deal.id));
                  setQuery("");
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-light)] ${
                  String(deal.id) === selectedId ? "bg-[var(--color-light)]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text-dark)]">
                    {deal.companyName}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {deal.title}
                    {deal.hint ? <span className="ml-2 text-gray-400">{deal.hint}</span> : null}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
