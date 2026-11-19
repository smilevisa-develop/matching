import Link from "next/link";

/** 案件ボード (パートナー向け) の上の帯 */
export default function BoardHeader({ partnerName }: { partnerName?: string }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/board" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-7 w-7 rounded" />
          <span className="text-sm font-bold text-[var(--color-text-dark)]">
            SMILE MATCHING <span className="font-normal text-gray-500">案件ボード / Job Board</span>
          </span>
        </Link>
        {partnerName ? <span className="truncate text-xs text-gray-500">{partnerName}</span> : null}
      </div>
    </header>
  );
}

/** ボードに入れないときの案内 */
export function BoardSignedOut({ invalid }: { invalid?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--color-light)]">
      <BoardHeader />
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-bold text-[var(--color-text-dark)]">
          {invalid ? "このリンクは使えません" : "専用リンクから開いてください"}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {invalid ? "This link is no longer valid." : "Please open the board from your personal link."}
        </p>
        <p className="mt-6 text-sm text-gray-600">
          案件ボードは、登録済みのパートナー様だけが見られます。リンクが分からない場合は、スマイルリンクの担当者にご連絡ください。
          <br />
          The board is for registered partners only. Please contact your SMILELINK representative for your link.
        </p>
      </main>
    </div>
  );
}
