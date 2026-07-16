"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 検索できる汎用 select (combobox)。value="" は未選択。
 * `items` は id / name のリスト。開くと検索ボックスが出て部分一致でフィルタ。
 * パートナー / 企業 / スタッフ など、要素数が多い select 全般で使う。
 */
export default function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = "未設定",
  emptyValueLabel = "未設定",
  searchPlaceholder = "名前で検索...",
  className,
  size = "md",
  allowClear = true,
}: {
  items: { id: number | string; name: string }[];
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyValueLabel?: string;
  searchPlaceholder?: string;
  className?: string;
  size?: "md" | "sm";
  /** false にすると「未設定」オプションを出さない (常に何か選択) */
  allowClear?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const valueStr = value === null || value === undefined ? "" : String(value);

  const selected = useMemo(
    () => (valueStr ? items.find((p) => String(p.id) === valueStr) : null),
    [items, valueStr],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const btnBase =
    "w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] flex items-center justify-between text-left";
  const btnSize = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${btnBase} ${btnSize}`}
      >
        <span className={selected ? "" : "text-gray-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/50"
              autoFocus
            />
          </div>
          <ul className="max-h-64 overflow-y-auto border-t border-gray-100">
            {allowClear ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${!valueStr ? "bg-gray-50 font-medium" : "text-gray-500"}`}
                >
                  {emptyValueLabel}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-gray-400">
                一致する候補がありません
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(String(p.id));
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${String(p.id) === valueStr ? "bg-gray-50 font-medium text-[var(--color-primary)]" : ""}`}
                  >
                    {p.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
