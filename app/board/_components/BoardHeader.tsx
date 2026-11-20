import Link from "next/link";
import { bt, type BoardLang } from "@/lib/board-i18n";
import LanguageSwitcher from "./LanguageSwitcher";

/** 案件ボード (パートナー向け) の上の帯。右に言語の切り替え */
export default function BoardHeader({ lang, partnerName }: { lang: BoardLang; partnerName?: string }) {
  return (
    <header className="bg-[var(--color-brand)] text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/board" className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 rounded bg-white" />
          <span className="text-sm font-bold text-white">
            SMILE MATCHING <span className="font-normal">{bt(lang, "headerTitle")}</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {partnerName ? <span className="hidden truncate text-xs text-white sm:inline">{partnerName}</span> : null}
          <LanguageSwitcher lang={lang} />
        </div>
      </div>
    </header>
  );
}

/** ボードに入れないときの案内 */
export function BoardSignedOut({ lang, invalid }: { lang: BoardLang; invalid?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--color-light)]">
      <BoardHeader lang={lang} />
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-bold text-[var(--color-text-dark)]">
          {bt(lang, invalid ? "signedOutInvalidTitle" : "signedOutTitle")}
        </p>
        <p className="mt-6 text-sm text-gray-600">{bt(lang, "signedOutBody")}</p>
      </main>
    </div>
  );
}
