import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEV_PREVIEW_TOKEN, getDeveloperAccount } from "@/lib/dev-preview";

export const dynamic = "force-dynamic";

type Screen = { label: string; href: string; note: string; external?: boolean };

const P = DEV_PREVIEW_TOKEN;

/** 候補者が見る画面 (見本のデータ。送信・保存はされない) */
const CANDIDATE_SCREENS: Screen[] = [
  { label: "入力フォーム", href: `/intake/${P}`, note: "履歴書の項目を候補者が入力する。上の帯で言語を切り替えられる" },
  { label: "日本語チェック", href: `/japanese-check/${P}`, note: "録音で答えるテスト。マイクの許可を求められる。結果は送られない" },
  { label: "母国語の求人票チェックリスト", href: `/checklist/${P}`, note: "求人票の条件を対訳で読んで、確認のチェックを付ける" },
  { label: "事前確認資料", href: `/document-check/${P}`, note: "内定後に企業の資料を対訳で読んでもらう" },
  { label: "AI面接練習", href: "/interview-practice", note: "見本ではなく本物。始めると練習の記録が残る (記録の画面に出る)" },
];

/** パートナーが見る画面 */
const PARTNER_SCREENS: Screen[] = [
  { label: "案件ボード", href: "/board", note: "社員として開くプレビュー。推薦・質問はできない" },
  { label: "パートナーアンケート", href: "/partner-survey/preview", note: "送信できないプレビュー" },
  { label: "新規パートナーの登録フォーム", href: `/partner-intake/${P}`, note: "送信してもパートナーは作られない" },
];

/** 社員向けで、まだ他の社員に出していない画面 */
const STAFF_DEV_SCREENS: Screen[] = [
  { label: "候補者ポータル (試作)", href: "/portal", note: "候補者が自分で入力・確認するポータルの試作。サイドバーには出していない" },
];

function ScreenList({ title, desc, screens }: { title: string; desc: string; screens: Screen[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-xs text-gray-500">{desc}</p>
      <ul className="mt-4 divide-y divide-gray-100">
        {screens.map((s) => (
          <li key={s.href} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-semibold text-[var(--color-primary)] hover:underline sm:w-64"
            >
              {s.label} ↗
            </Link>
            <span className="text-xs text-gray-600">{s.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 開発中の画面 (開発者だけ。lib/dev-preview.ts)。
 * 候補者・パートナー・企業が見る画面と、まだ他の社員に出していない画面をまとめて開ける。
 */
export default async function DevScreensPage() {
  const developer = await getDeveloperAccount();
  if (!developer) redirect("/");

  // 企業向けの推薦リストは見本が作れないので、実際に共有中のものを見るだけで開く
  const sharedLists = await prisma.deal.findMany({
    where: { shareToken: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, title: true, shareToken: true, company: { select: { name: true } } },
  });

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">開発中の画面</h1>
        <p className="mt-1 text-sm text-gray-600">
          {developer.name}さんだけに出ています。他の社員のサイドバーには出ず、下のプレビューのリンクも他の社員が開くと「見つかりません」になります。
        </p>
      </div>

      <ScreenList
        title="候補者が見る画面"
        desc="見本の候補者 (実在しない人) で表示します。画面の上に黄色い帯が出ます。"
        screens={CANDIDATE_SCREENS}
      />
      <ScreenList title="パートナーが見る画面" desc="見本またはプレビューで表示します。" screens={PARTNER_SCREENS} />

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-bold text-gray-900">企業が見る画面 (推薦リスト)</h2>
        <p className="mt-1 text-xs text-gray-500">
          実際に企業へ共有中のリストです。開いて見るだけなら何も変わりません (編集には暗証番号が要ります)。
        </p>
        {sharedLists.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">共有中のリストはありません。</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {sharedLists.map((d) => (
              <li key={d.id} className="py-3">
                <Link
                  href={`/list/${d.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {d.company.name} / {d.title} ↗
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ScreenList
        title="社員向けの開発中の画面"
        desc="まだサイドバーに出していない画面です。"
        screens={STAFF_DEV_SCREENS}
      />
    </main>
  );
}
