"use client";

import type { ReactNode } from "react";

/**
 * アイコンに hover でツールチップを表示するラッパー。
 *
 * 使い方:
 *   <IconTooltip label="履歴書作成">
 *     <button>...</button>
 *   </IconTooltip>
 */
export default function IconTooltip({
  label,
  children,
  position = "bottom",
}: {
  label: string;
  children: ReactNode;
  position?: "top" | "bottom";
}) {
  const placement =
    position === "top"
      ? "bottom-full mb-1.5"
      : "top-full mt-1.5";
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={`pointer-events-none absolute left-1/2 ${placement} z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100`}
      >
        {label}
      </span>
    </span>
  );
}
