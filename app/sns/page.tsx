import { requireCurrentAccount } from "@/lib/auth";
import { getYoutubeStats, youtubeConfigured, type YoutubeChannel } from "@/lib/sns-youtube";
import { getMetaStats, metaConfigured, type MetaPage, type MetaPost } from "@/lib/sns-meta";
import { getTiktokConnection, getTiktokStats, type TiktokAccount } from "@/lib/sns-tiktok";
import SnsChart, { type ChartGroup, type ChartItem } from "./SnsChart";
import { PLATFORMS } from "@/lib/sns-platforms";
import { FUNNEL_COUNTRIES, FUNNEL_PLATFORMS, getFunnelCounts, type FunnelCounts } from "@/lib/sns-funnel";

export const dynamic = "force-dynamic";

/**
 * SNS の数字。候補者向けに投稿している動画 (YouTube / Facebook / Instagram / TikTok) の再生数などを 1 か所で見る。
 * 上: 公開日ごとの媒体別の積み上げ (インドネシア / ベトナム)。下: 媒体ごとにインドネシアとベトナムを横に並べる。
 * 接続 (API キー・トークン) は設定ページの「SNS 連携」
 */
type Country = "id" | "vn" | "other";
const COUNTRY: { key: Country; label: string }[] = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
];

function countryOf(name: string): Country {
  const n = name.toLowerCase();
  if (/indonesia|\bid\b|_id\b|idn/.test(n)) return "id";
  if (/vi[eệ][tc]|vn\b|việc|l[aà]m\s*jp/.test(n)) return "vn";
  return "other";
}

export default async function SnsPage() {
  const account = await requireCurrentAccount();
  const tiktokConn = await getTiktokConnection();
  const [tiktok, yt, meta, funnel7, funnel30] = await Promise.all([
    tiktokConn.accounts.length > 0 ? getTiktokStats() : null,
    youtubeConfigured() ? getYoutubeStats() : null,
    (async () => ((await metaConfigured()) ? getMetaStats() : null))(),
    getFunnelCounts(7),
    getFunnelCounts(30),
  ]);

  const ytBy = (c: Country) => (yt?.channels ?? []).filter((x) => countryOf(`${x.title} ${x.handle ?? ""}`) === c);
  const fbBy = (c: Country) => (meta?.pages ?? []).filter((x) => countryOf(x.name) === c);
  const igBy = (c: Country) => (meta?.pages ?? []).filter((x) => x.instagram && countryOf(`${x.name} ${x.instagram.username}`) === c);
  const ttBy = (c: Country) => (tiktok?.accounts ?? []).filter((x) => countryOf(x.displayName) === c);

  const groups: ChartGroup[] = COUNTRY.map(({ key, label }) => {
    const items: ChartItem[] = [];
    for (const ch of ytBy(key)) for (const v of ch.videos) items.push({ platform: "youtube", date: v.publishedAt, views: v.views, title: v.title });
    for (const pg of fbBy(key)) for (const v of pg.posts) items.push({ platform: "facebook", date: v.publishedAt, views: v.views ?? 0, title: v.text });
    for (const pg of igBy(key)) for (const v of pg.instagram!.posts) items.push({ platform: "instagram", date: v.publishedAt, views: v.views ?? 0, title: v.text });
    for (const a of ttBy(key)) for (const v of a.videos) items.push({ platform: "tiktok", date: v.publishedAt, views: v.views, title: v.title });
    return { label, items };
  });

  const errors = [...(yt?.errors ?? []), ...(meta?.errors ?? []), ...(tiktok?.errors ?? [])];
  const others = { yt: ytBy("other"), fb: fbBy("other"), ig: igBy("other"), tt: ttBy("other") };
  const nothing = !yt && !meta && !tiktok;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">SNS</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dark)]">候補者向けに投稿している動画の数字。1 時間ごとに更新</p>
        </div>
        {account.role === "admin" ? (
          <a href="/settings#sns" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
            接続の設定（YouTube / Meta / TikTok）
          </a>
        ) : null}
      </div>

      {errors.map((e) => (
        <p key={e.id} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {e.id}: {e.error}
        </p>
      ))}
      {nothing ? <p className="text-sm text-[var(--color-text-dark)]">まだどの SNS も接続していません。設定ページの「SNS 連携」から接続してください</p> : null}

      <FunnelCard counts={[funnel7, funnel30]} isAdmin={account.role === "admin"} />

      <SnsChart groups={groups} />

      {PLATFORMS.map((p) => (
        <div key={p.key} className="grid gap-6 lg:grid-cols-2">
          {COUNTRY.map(({ key }) => (
            <div key={key} className="space-y-6">
              {p.key === "youtube" ? ytBy(key).map((c) => <ChannelCard key={c.id} channel={c} />) : null}
              {p.key === "facebook" ? fbBy(key).map((pg) => <FbCard key={pg.id} page={pg} />) : null}
              {p.key === "instagram" ? igBy(key).map((pg) => <IgCard key={pg.id} page={pg} />) : null}
              {p.key === "tiktok" ? ttBy(key).map((a) => <TiktokCard key={a.openId} account={a} />) : null}
            </div>
          ))}
        </div>
      ))}

      {others.yt.length + others.fb.length + others.ig.length + others.tt.length > 0 ? (
        <>
          <h2 className="text-lg font-bold text-[var(--color-text-dark)]">その他のアカウント</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {others.yt.map((c) => <ChannelCard key={c.id} channel={c} />)}
            {others.fb.map((pg) => <FbCard key={pg.id} page={pg} />)}
            {others.ig.map((pg) => <IgCard key={pg.id} page={pg} />)}
            {others.tt.map((a) => <TiktokCard key={a.openId} account={a} />)}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FbCard({ page: p }: { page: MetaPage }) {
  return (
    <Card
      title={
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          Facebook ・ {p.name}
        </a>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="フォロワー" value={p.followers === null ? "-" : p.followers.toLocaleString("ja-JP")} />
      </div>
      <PostTable posts={p.posts} />
    </Card>
  );
}

function IgCard({ page: p }: { page: MetaPage }) {
  const ig = p.instagram!;
  return (
    <Card
      title={
        <a href={ig.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          Instagram ・ @{ig.username}
        </a>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="フォロワー" value={ig.followers === null ? "-" : ig.followers.toLocaleString("ja-JP")} />
        <Stat label="投稿数" value={ig.mediaCount === null ? "-" : ig.mediaCount.toLocaleString("ja-JP")} />
      </div>
      <PostTable posts={ig.posts} />
    </Card>
  );
}

function ChannelCard({ channel: c }: { channel: YoutubeChannel }) {
  const fmt = (v: number) => v.toLocaleString("ja-JP");
  const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "");
  return (
    <Card
      title={
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          YouTube ・ {c.title}
          {c.handle ? <span className="ml-2 text-sm font-normal">{c.handle}</span> : null}
        </a>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="登録者" value={fmt(c.subscribers)} />
        <Stat label="総再生数" value={fmt(c.totalViews)} />
        <Stat label="動画数" value={fmt(c.videoCount)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
              <th className="px-3 py-2">動画</th>
              <th className="px-3 py-2 w-28">公開日</th>
              <th className="px-3 py-2 w-24 text-right">再生</th>
              <th className="px-3 py-2 w-20 text-right">高評価</th>
              <th className="px-3 py-2 w-20 text-right">コメント</th>
            </tr>
          </thead>
          <tbody>
            {c.videos.map((v) => (
              <tr key={v.id} className="border-t border-gray-100">
                <td className="px-3 py-2">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                    {v.title}
                  </a>
                </td>
                <td className="px-3 py-2 tabular-nums text-[var(--color-text-dark)]">{day(v.publishedAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-text-dark)]">{fmt(v.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.comments)}</td>
              </tr>
            ))}
            {c.videos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm text-[var(--color-text-dark)]">
                  動画がありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TiktokCard({ account: a }: { account: TiktokAccount }) {
  const fmt = (v: number | null) => (v === null ? "-" : v.toLocaleString("ja-JP"));
  return (
    <Card
      title={
        a.url ? (
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            TikTok ・ {a.displayName}
          </a>
        ) : (
          `TikTok ・ ${a.displayName}`
        )
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="フォロワー" value={fmt(a.followers)} />
        <Stat label="いいね合計" value={fmt(a.likes)} />
        <Stat label="動画数" value={fmt(a.videoCount)} />
      </div>
      <PostTable posts={a.videos.map((v) => ({ id: v.id, text: v.title, publishedAt: v.publishedAt, url: v.url, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares }))} />
    </Card>
  );
}

function PostTable({ posts }: { posts: MetaPost[] }) {
  const fmt = (v: number | null) => (v === null ? "-" : v.toLocaleString("ja-JP"));
  const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "");
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
            <th className="px-3 py-2">投稿</th>
            <th className="px-3 py-2 w-28">公開日</th>
            <th className="px-3 py-2 w-24 text-right">再生</th>
            <th className="px-3 py-2 w-20 text-right">いいね</th>
            <th className="px-3 py-2 w-20 text-right">コメント</th>
            <th className="px-3 py-2 w-20 text-right">シェア</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((v) => (
            <tr key={v.id} className="border-t border-gray-100">
              <td className="px-3 py-2">
                {v.url ? (
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                    {v.text || "(本文なし)"}
                  </a>
                ) : (
                  v.text || "(本文なし)"
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-[var(--color-text-dark)]">{day(v.publishedAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-text-dark)]">{fmt(v.views)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.likes)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.comments)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.shares)}</td>
            </tr>
          ))}
          {posts.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-sm text-[var(--color-text-dark)]">
                投稿がありません
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** 相談につながった数。相談リンクが押された数 (媒体ごと) と、相談を始めた人数 (国ごと) */
function FunnelCard({ counts, isAdmin }: { counts: FunnelCounts[]; isAdmin: boolean }) {
  const cell = (f: (c: FunnelCounts) => number) => counts.map(f).join(" / ");
  return (
    <Card title="相談につながった数（直近 7 日 / 30 日）">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
              <th className="px-3 py-2"></th>
              {FUNNEL_PLATFORMS.map((p) => (
                <th key={p.key} className="px-3 py-2 text-right">
                  {p.label} から
                </th>
              ))}
              <th className="px-3 py-2 text-right">相談を始めた人</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_COUNTRIES.map((c) => (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-[var(--color-text-dark)]">{c.label}</td>
                {FUNNEL_PLATFORMS.map((p) => (
                  <td key={p.key} className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">
                    {cell((x) => x.clicks[c.key][p.key])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-text-dark)]">{cell((x) => x.inquiries[c.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--color-text-dark)]">
        「から」はプロフィールの相談リンクが押された数。「相談を始めた人」は相談用の LINE に初めてメッセージや友だち追加をした人数
        {isAdmin ? (
          <>
            {"（リンクは "}
            <a href="/settings#sns" className="font-medium text-[var(--color-primary)] hover:underline">
              設定の「相談リンク」
            </a>
            {"）"}
          </>
        ) : null}
      </p>
    </Card>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-light)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-dark)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-dark)]">{value}</p>
    </div>
  );
}
