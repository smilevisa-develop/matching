import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { getYoutubeStats, youtubeConfigured } from "@/lib/sns-youtube";
import { getMetaStats, metaConfigured } from "@/lib/sns-meta";
import { getTiktokConnection, getTiktokStats } from "@/lib/sns-tiktok";
import SnsChart from "./SnsChart";
import VideoTable, { type VideoRow } from "./VideoTable";
import { PLATFORMS, type PlatformKey } from "@/lib/sns-platforms";
import { FUNNEL_PLATFORMS, getFunnelCounts, type FunnelCounts, type FunnelPlatform } from "@/lib/sns-funnel";

export const dynamic = "force-dynamic";

/**
 * SNS の数字。目的は「SNS で求職者を集めて、Facebook ページでの相談につなげる」こと。
 * 一番上で国 (インドネシア / ベトナム / 比較 = 2 か国を横に並べる) と期間 (1 週間 / 2 週間 / 30 日 / 60 日) を選ぶ。どちらもページ全体に効く。
 * 1. 公開日ごとの再生数 (媒体別の積み上げ)
 * 2. まとめ: 投稿 → 再生 → リンクのクリック → Facebook で相談 (と別枠の LINE)。前の同じ日数と比べる
 * 3. 媒体ごと: フォロワー・投稿数・再生・1 本あたりの再生・反応・リンクのクリック
 * 4. 動画ごと: 行 = 動画、列 = 媒体。並び替え・絞り込みは VideoTable.tsx
 * 接続は設定ページの「SNS 連携」
 */
type Country = "id" | "vn" | "other";
const COUNTRIES: { key: Exclude<Country, "other">; label: string }[] = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
];
const PERIODS = [
  { days: 7, label: "直近 1 週間" },
  { days: 14, label: "直近 2 週間" },
  { days: 30, label: "直近 30 日" },
  { days: 60, label: "直近 60 日" },
] as const;
type Tab = "id" | "vn" | "compare";
const TABS: { key: Tab; label: string }[] = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
  { key: "compare", label: "比較" },
];

function countryOf(name: string): Country {
  const n = name.toLowerCase();
  if (/indonesia|\bid\b|_id\b|idn/.test(n)) return "id";
  if (/vi[eệ][tc]|vn\b|việc|l[aà]m\s*jp/.test(n)) return "vn";
  return "other";
}

type Video = { country: Country; platform: PlatformKey; title: string; url: string | null; date: string; views: number; likes: number | null; comments: number | null; shares: number | null };
type Acct = { country: Country; platform: PlatformKey; name: string; url: string | null; followers: number | null };

const fmt = (v: number | null) => (v === null ? "-" : v.toLocaleString("ja-JP"));
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
/** 直近 days 日 (offset を渡すと、その日数だけ前にずらした days 日) に公開したか */
function publishedWithin(date: string, days: number, offset = 0) {
  const until = Date.now() - offset * 86400_000;
  const t = new Date(date).getTime();
  return t >= until - days * 86400_000 && t < until;
}
/** 期間のすべての日 (日本時間の YYYY-MM-DD、古い順) */
function periodDates(days: number) {
  const today = Date.now() + 9 * 3600_000;
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86400_000).toISOString().slice(0, 10));
}
const platformOf = (k: PlatformKey) => PLATFORMS.find((p) => p.key === k)!;

export default async function SnsPage({ searchParams }: { searchParams: Promise<{ d?: string; c?: string }> }) {
  const account = await requireCurrentAccount();
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p.days) === sp.d)?.days ?? 30;
  const tab: Tab = sp.c === "vn" || sp.c === "compare" ? sp.c : "id";
  const shown = tab === "compare" ? COUNTRIES : COUNTRIES.filter((c) => c.key === tab);

  const tiktokConn = await getTiktokConnection();
  const [tiktok, yt, meta, funnel, funnelPrev] = await Promise.all([
    tiktokConn.accounts.length > 0 ? getTiktokStats() : null,
    youtubeConfigured() ? getYoutubeStats() : null,
    (async () => ((await metaConfigured()) ? getMetaStats() : null))(),
    getFunnelCounts(days),
    getFunnelCounts(days, days),
  ]);

  // 媒体をまたいで、動画とアカウントを 1 つの形にそろえる
  const videos: Video[] = [];
  const accts: Acct[] = [];
  for (const ch of yt?.channels ?? []) {
    const country = countryOf(`${ch.title} ${ch.handle ?? ""}`);
    accts.push({ country, platform: "youtube", name: ch.title, url: ch.url, followers: ch.subscribers });
    for (const v of ch.videos) videos.push({ country, platform: "youtube", title: v.title, url: v.url, date: v.publishedAt, views: v.views, likes: v.likes, comments: v.comments, shares: null });
  }
  for (const pg of meta?.pages ?? []) {
    const country = countryOf(pg.name);
    accts.push({ country, platform: "facebook", name: pg.name, url: pg.url, followers: pg.followers });
    for (const v of pg.posts) videos.push({ country, platform: "facebook", title: v.text, url: v.url, date: v.publishedAt, views: v.views ?? 0, likes: v.likes, comments: v.comments, shares: v.shares });
    const ig = pg.instagram;
    if (ig) {
      const igCountry = countryOf(`${pg.name} ${ig.username}`);
      accts.push({ country: igCountry, platform: "instagram", name: `@${ig.username}`, url: ig.url, followers: ig.followers });
      for (const v of ig.posts) videos.push({ country: igCountry, platform: "instagram", title: v.text, url: v.url, date: v.publishedAt, views: v.views ?? 0, likes: v.likes, comments: v.comments, shares: v.shares });
    }
  }
  for (const a of tiktok?.accounts ?? []) {
    const country = countryOf(a.displayName);
    accts.push({ country, platform: "tiktok", name: a.displayName, url: a.url, followers: a.followers });
    for (const v of a.videos) videos.push({ country, platform: "tiktok", title: v.title, url: v.url, date: v.publishedAt, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares });
  }

  const cur = videos.filter((v) => publishedWithin(v.date, days));
  const prev = videos.filter((v) => publishedWithin(v.date, days, days));
  const errors = [...(yt?.errors ?? []), ...(meta?.errors ?? []), ...(tiktok?.errors ?? [])];
  const nothing = !yt && !meta && !tiktok;
  const href = (q: { d?: number; c?: Tab }) => {
    const p = new URLSearchParams();
    const d = q.d ?? days;
    const c = q.c ?? tab;
    if (c !== "id") p.set("c", c);
    if (d !== 30) p.set("d", String(d));
    const str = p.toString();
    return str ? `/sns?${str}` : "/sns";
  };
  const grid = tab === "compare" ? "grid gap-6 lg:grid-cols-2" : "space-y-6";
  const periodLabel = PERIODS.find((p) => p.days === days)!.label;

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

      {/* 国のタブと期間。ページ全体 (グラフも) に効く */}
      <div className="sticky top-0 z-20 -mx-8 flex flex-wrap items-end justify-between gap-4 border-b border-gray-300 bg-white px-8 pt-2">
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ c: t.key })}
              className={`-mb-px border-b-[3px] px-5 pb-3 pt-2 text-base font-bold ${
                t.key === tab ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-[var(--color-text-dark)] hover:border-gray-300"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-text-dark)]">期間</span>
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={href({ d: p.days })}
                className={`rounded-md px-3 py-1 text-sm font-semibold ${p.days === days ? "bg-white text-[var(--color-text-dark)] shadow" : "text-[var(--color-text-dark)] hover:bg-white/60"}`}
              >
                {p.label.replace("直近 ", "")}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {errors.map((e) => (
        <p key={e.id} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {e.id}: {e.error}
        </p>
      ))}
      {nothing ? <p className="text-sm text-[var(--color-text-dark)]">まだどの SNS も接続していません。設定ページの「SNS 連携」から接続してください</p> : null}

      {/* 1. 公開日ごとの再生数 */}
      <SnsChart
        dates={periodDates(days)}
        groups={shown.map((c) => ({
          label: tab === "compare" ? c.label : "",
          items: cur.filter((v) => v.country === c.key).map((v) => ({ platform: v.platform, date: v.date, views: v.views, title: v.title })),
        }))}
      />

      {/* 2. まとめ (前の同じ日数と比べる) と 3. 媒体ごと。1 か国のときは左右に並べる */}
      <div className={grid}>
        {shown.map((c) => {
          const v = cur.filter((x) => x.country === c.key);
          const pv = prev.filter((x) => x.country === c.key);
          const clicks = (f: FunnelCounts) => sum(FUNNEL_PLATFORMS.map((p) => f.clicks[c.key][p.key]));
          const name = tab === "compare" ? `${c.label}　` : "";
          return (
            <div key={c.key} className={tab === "compare" ? "space-y-6" : "grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}>
              <Card title={`${name}${periodLabel}（その前の ${periodLabel.replace("直近 ", "")}と比べて）`}>
                <div className="grid grid-cols-2 gap-3">
                  <Kpi label="投稿" value={v.length} prev={pv.length} unit="本" />
                  <Kpi label="再生" value={sum(v.map((x) => x.views))} prev={sum(pv.map((x) => x.views))} />
                  <Kpi label="リンクのクリック" value={clicks(funnel)} prev={clicks(funnelPrev)} />
                  <Kpi label="LINE" value={funnel.inquiries[c.key].LINE} prev={funnelPrev.inquiries[c.key].LINE} unit="人" />
                  <Kpi label="Facebook で相談" value={funnel.inquiries[c.key].Messenger} prev={funnelPrev.inquiries[c.key].Messenger} unit="人" strong />
                </div>
              </Card>
              <Card title={`${name}媒体ごと`}>
                <Table
                  head={["媒体", "フォロワー", "投稿", "再生", "1 本あたり", "いいね", "コメント", "リンク"]}
                  align={["left", "right", "right", "right", "right", "right", "right", "right"]}
                  rows={PLATFORMS.flatMap((p) => {
                    const as = accts.filter((a) => a.country === c.key && a.platform === p.key);
                    if (as.length === 0) return [];
                    const pvids = v.filter((x) => x.platform === p.key);
                    const views = sum(pvids.map((x) => x.views));
                    return [
                      [
                        <PlatformName key="p" platform={p.key} url={as[0].url} />,
                        fmt(as.some((a) => a.followers !== null) ? sum(as.map((a) => a.followers)) : null),
                        fmt(pvids.length),
                        <span key="v" className="font-semibold">{fmt(views)}</span>,
                        fmt(pvids.length ? Math.round(views / pvids.length) : null),
                        fmt(sum(pvids.map((x) => x.likes))),
                        fmt(sum(pvids.map((x) => x.comments))),
                        p.key === "facebook" ? "-" : fmt(funnel.clicks[c.key][p.key as FunnelPlatform]),
                      ],
                    ];
                  })}
                />
                <p className="mt-3 text-xs text-[var(--color-text-dark)]">
                  再生・いいね・コメントはこの期間に公開した動画の分。リンクはプロフィールのリンクが押されて Facebook ページに来た回数。Facebook で相談は Facebook ページに初めてメッセージをした人数
                </p>
              </Card>
            </div>
          );
        })}
      </div>

      {/* 4. 動画ごと (行 = 動画、列 = 媒体) */}
      <div className={grid}>
        {shown.map((c) => (
          <Card key={c.key} title={`${tab === "compare" ? `${c.label}　` : ""}動画ごと`}>
            <VideoTable rows={toRows(cur.filter((v) => v.country === c.key), c.label)} showCountry={false} />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** 同じ動画を全媒体に上げているので、国と題名 (「👉 …」の前、記号を除いた頭の部分) でまとめる */
function toRows(videos: Video[], countryLabel: string): VideoRow[] {
  const keyOf = (v: Video) => `${v.country}:${v.title.split("👉")[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 24)}`;
  const clean = (t: string) => t.split("👉")[0].split("\n")[0].trim();
  const map = new Map<string, VideoRow>();
  for (const v of videos) {
    const k = keyOf(v);
    const row = map.get(k) ?? { key: k, title: clean(v.title), date: v.date, country: countryLabel, cells: {} };
    if (v.date < row.date) row.date = v.date;
    if (v.platform === "youtube" || !row.title) row.title = clean(v.title);
    const c = row.cells[v.platform];
    // 同じ媒体に同じ動画が 2 本あれば足す
    row.cells[v.platform] = c
      ? { views: c.views + v.views, likes: add(c.likes, v.likes), comments: add(c.comments, v.comments), shares: add(c.shares, v.shares), url: c.url ?? v.url }
      : { views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, url: v.url };
    map.set(k, row);
  }
  return [...map.values()];
}
const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

/** 数字のカード 1 枚。前の期間からの増減も出す。strong は一番大事な数字 (横いっぱい・数字を緑) */
function Kpi({ label, value, prev, unit = "", strong = false }: { label: string; value: number; prev: number; unit?: string; strong?: boolean }) {
  const diff = value - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <div className={`rounded-xl bg-[var(--color-light)] px-4 py-3 ${strong ? "col-span-2" : ""}`}>
      <p className="text-sm font-semibold text-[var(--color-text-dark)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${strong ? "text-[var(--color-primary)]" : "text-[var(--color-text-dark)]"}`}>
        {fmt(value)}
        {unit ? <span className="ml-1 text-sm font-semibold">{unit}</span> : null}
      </p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums">
        <span className={diff > 0 ? "text-green-700" : diff < 0 ? "text-red-700" : "text-[var(--color-text-dark)]"}>
          {diff > 0 ? "↑" : diff < 0 ? "↓" : ""}
          {pct !== null ? `${Math.abs(pct)}%` : diff === 0 ? "変化なし" : fmt(Math.abs(diff))}
        </span>
        <span className="ml-1.5 font-normal text-[var(--color-text-dark)]">前 {fmt(prev)}</span>
      </p>
    </div>
  );
}

function PlatformName({ platform, url }: { platform: PlatformKey; url?: string | null }) {
  const p = platformOf(platform);
  const label = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
      {p.label}
    </span>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {label}
    </a>
  ) : (
    label
  );
}

function Table({ head, align, rows, empty }: { head: string[]; align: ("left" | "right")[]; rows: React.ReactNode[][]; empty?: string }) {
  const cls = (i: number) => `px-3 py-2.5 ${align[i] === "right" ? "text-right tabular-nums" : "text-left"}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-[var(--color-text-dark)]">
        <thead>
          <tr className="border-b-2 border-gray-200 text-xs font-semibold">
            {head.map((h, i) => (
              <th key={i} className={`${cls(i)} whitespace-nowrap`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
              {r.map((c, i) => (
                <td key={i} className={cls(i)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center">
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
