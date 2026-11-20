"use client";

import { useRouter } from "next/navigation";
import { BOARD_LANG_COOKIE, BOARD_LANG_NAMES, BOARD_LANGS, bt, type BoardLang } from "@/lib/board-i18n";

/** 案件ボードの言語の切り替え (cookie に入れて画面を読み直す) */
export default function LanguageSwitcher({ lang }: { lang: BoardLang }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs text-white">
      <span className="sr-only">{bt(lang, "language")}</span>
      <span aria-hidden="true">🌐</span>
      <select
        value={lang}
        aria-label={bt(lang, "language")}
        onChange={(e) => {
          document.cookie = `${BOARD_LANG_COOKIE}=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          router.refresh();
        }}
        className="rounded-md border border-white/60 bg-transparent px-1.5 py-1 text-xs text-white [&>option]:text-[var(--color-text-dark)]"
      >
        {BOARD_LANGS.map((l) => (
          <option key={l} value={l}>
            {BOARD_LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
