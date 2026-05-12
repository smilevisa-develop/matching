"use client";

/**
 * ☆ 1〜5 評価コンポーネント
 *   value: 0 = 未評価、1〜5
 *   readOnly: 表示専用
 *   size: アイコンサイズ (px)
 */
export default function RatingStars({
  value,
  onChange,
  readOnly = false,
  size = 20,
}: {
  value: number | null;
  onChange?: (next: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  const v = Math.max(0, Math.min(5, Math.round(value ?? 0)));
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= v;
        const interactive = !readOnly && onChange;
        const Tag = interactive ? "button" : "span";
        return (
          <Tag
            key={n}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onChange(n === v ? 0 : n) : undefined}
            aria-label={`星 ${n}`}
            className={
              interactive
                ? "rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                : "p-0.5"
            }
          >
            <Star size={size} filled={filled} />
          </Tag>
        );
      })}
      {!readOnly && v > 0 ? (
        <button
          type="button"
          onClick={() => onChange?.(0)}
          className="ml-1 text-[11px] text-gray-400 hover:text-gray-600"
        >
          クリア
        </button>
      ) : null}
    </div>
  );
}

function Star({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "#F59E0B" : "none"}
      stroke={filled ? "#F59E0B" : "#D1D5DB"}
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2 L14.7 8.8 L22 9.4 L16.4 14.2 L18.2 21.2 L12 17.4 L5.8 21.2 L7.6 14.2 L2 9.4 L9.3 8.8 Z" />
    </svg>
  );
}
