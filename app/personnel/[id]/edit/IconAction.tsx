"use client";

import type { ReactNode } from "react";

/**
 * 候補者詳細の上部に並ぶ操作アイコン。
 *
 * アイコンだけだと何のボタンか分からないため、必ず下にラベルを出す。
 * (以前は hover のツールチップだけだった)
 */
export default function IconAction({
  label,
  children,
  onClick,
  href,
  disabled = false,
  /** AI 取込のようにグラデーションで強調するボタン */
  accent = false,
  title,
}: {
  /** アイコンの下に出す短いラベル (4〜5 文字まで) */
  label: string;
  children: ReactNode;
  onClick?: () => void;
  /** リンクとして開く場合 (Drive など) */
  href?: string;
  disabled?: boolean;
  accent?: boolean;
  /** hover 時の補足説明 */
  title?: string;
}) {
  const iconClass = accent
    ? "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#A78BFA] via-[#F472B6] to-[#F59E0B] text-white shadow-md transition-transform group-hover:scale-110"
    : "flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--color-primary)] transition-transform group-hover:scale-110 group-hover:bg-[var(--color-light)]";

  const labelClass = `text-[10px] font-medium leading-none ${
    disabled ? "text-gray-300" : "text-gray-500"
  }`;

  const inner = (
    <>
      <span className={disabled ? `${iconClass} opacity-40` : iconClass}>{children}</span>
      <span className={labelClass}>{label}</span>
    </>
  );

  const wrapperClass =
    "group flex w-14 flex-col items-center gap-1.5 disabled:cursor-not-allowed";

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title ?? label}
        className={wrapperClass}
      >
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title ?? label} className={wrapperClass}>
      {inner}
    </button>
  );
}

/** アイコンのまとまりを区切る縦線 */
export function IconActionDivider() {
  return <span className="h-8 w-px shrink-0 self-start bg-gray-200" aria-hidden />;
}
