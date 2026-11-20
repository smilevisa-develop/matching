import Link from "next/link";

/** 開発者用のプレビューで画面の上に出す帯。送信・保存されないことを示す */
export default function DevPreviewBanner({
  langs,
  current,
  basePath,
}: {
  /** 言語を切り替えられるときの候補 (value → 表示名) */
  langs?: Record<string, string>;
  current?: string;
  basePath?: string;
}) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-xs text-amber-900 shadow-sm">
      <span className="font-bold">開発用のプレビュー</span>
      <span>見本のデータです。送信・保存はされません。</span>
      {langs && basePath ? (
        <span className="flex flex-wrap gap-2">
          {Object.entries(langs).map(([value, label]) => (
            <Link
              key={value}
              href={`${basePath}?lang=${value}`}
              className={value === current ? "font-bold underline" : "underline-offset-2 hover:underline"}
            >
              {label}
            </Link>
          ))}
        </span>
      ) : null}
      <Link href="/dev" className="ml-auto underline">
        開発中の画面へ戻る
      </Link>
    </div>
  );
}
