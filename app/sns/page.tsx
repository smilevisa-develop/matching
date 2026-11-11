import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { getYoutubeStats, youtubeConfigured } from "@/lib/sns-youtube";
import { getMetaStats, metaConfigured } from "@/lib/sns-meta";
import { getTiktokConnection, getTiktokStats } from "@/lib/sns-tiktok";
import SnsChart, { type ChartGroup } from "./SnsChart";
import { PLATFORMS, type PlatformKey } from "@/lib/sns-platforms";
import { FUNNEL_PLATFORMS, getFunnelCounts, type FunnelCounts } from "@/lib/sns-funnel";

export const dynamic = "force-dynamic";

/**
 * SNS の数字。目的は「SNS で求職者を集めて、Facebook ページでの相談につなげる」こと。上から順に:
 * 1. 公開日ごとの再生数 (媒体別の積み上げ。国ごと)
 * 2. 期間のまとめ (国ごと): 再生 → リンクのクリック → Facebook で相談。前の同じ日数と比べる
 * 3. 相談につながった数: どの媒体のリンクから Facebook ページに来たか
 * 4. 媒体ごと: フォロワー・投稿数・再生・1 本あたりの再生・反応
 * 5. 動画ごと: 期間内に公開した動画を再生の多い順に
 * 期間は上の 7 日 / 30 日 / 90 日 で切り替える (1 のグラフは直近 30 公開日のまま)。接続は設定ページの「SNS 連携」
 */
type Country = "id" | "vn" | "other";
const COUNTRIES: { key: Exclude<Country, "other">; label: string }[] = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
];
const PERIODS = [7, 30, 90] as const;

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
const platformOf = (k: PlatformKey) => PLATFORMS.find((p) => p.key === k)!;

export default async function SnsPage({ searchParams }: { searchParams: Promise<{ days?: string; c?: string }> }) {
  const account = await requireCurrentAccount();
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === sp.days) ?? 30;
  const only = sp.c === "id" || sp.c === "vn" ? sp.c : null;

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

  const groups: ChartGroup[] = COUNTRIES.map(({ key, label }) => ({
    label,
    items: videos.filter((v) => v.country === key).map((v) => ({ platform: v.platform, date: v.date, views: v.views, title: v.title })),
  }));
  const errors = [...(yt?.errors ?? []), ...(meta?.errors ?? []), ...(tiktok?.errors ?? [])];
  const nothing = !yt && !meta && !tiktok;
  const href = (q: { days?: number; c?: string | null }) => {
    const p = new URLSearchParams();
    const d = q.days ?? days;
    if (d !== 30) p.set("days", String(d));
    const c = q.c === undefined ? only : q.c;
    if (c) p.set("c", c);
    const s = p.toString();
    return s ? `/sns?${s}` : "/sns";
  };

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

      <SnsChart groups={groups} />

      {/* 期間の切り替え (ここから下に効く) */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--color-text-dark)]">期間</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={href({ days: d })}
              className={`px-4 py-1.5 text-sm font-medium ${d === days ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-text-dark)] hover:bg-gray-50"}`}
            >
              直近 {d} 日
            </Link>
          ))}
        </div>
        <span className="text-sm text-[var(--color-text-dark)]">↓ はこの期間の数字。「前の {days} 日」と比べています</span>
      </div>

      {/* 2. 期間のまとめ (国ごと) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {COUNTRIES.map((c) => {
          const v = cur.filter((x) => x.country === c.key);
          const pv = prev.filter((x) => x.country === c.key);
          const clicks = (f: FunnelCounts) => sum(FUNNEL_PLATFORMS.map((p) => f.clicks[c.key][p.key]));
          return (
            <Card key={c.key} title={c.label}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="投稿した動画" value={v.length} prev={pv.length} unit="本" />
                <Kpi label="その動画の再生" value={sum(v.map((x) => x.views))} prev={sum(pv.map((x) => x.views))} />
                <Kpi label="リンクのクリック" value={clicks(funnel)} prev={clicks(funnelPrev)} />
                <Kpi label="Facebook で相談" value={funnel.inquiries[c.key].Messenger} prev={funnelPrev.inquiries[c.key].Messenger} unit="人" strong />
              </div>
            </Card>
          );
        })}
      </div>

      {/* 3. 相談につながった数 */}
      <Card title="相談につながった数">
        <Table
          head={[
            "",
            ...FUNNEL_PLATFORMS.map((p) => `${p.label} のリンク`),
            "リンクの合計",
            "Facebook で相談",
            "LINE 友だち（別枠）",
          ]}
          align={["left", "right", "right", "right", "right", "right", "right"]}
          rows={COUNTRIES.map((c) => [
            <span key="c" className="font-semibold">{c.label}</span>,
            ...FUNNEL_PLATFORMS.map((p) => fmt(funnel.clicks[c.key][p.key])),
            <span key="t" className="font-semibold">{fmt(sum(FUNNEL_PLATFORMS.map((p) => funnel.clicks[c.key][p.key])))}</span>,
            <span key="m" className="text-base font-bold">{fmt(funnel.inquiries[c.key].Messenger)}</span>,
            fmt(funnel.inquiries[c.key].LINE),
          ])}
        />
        <p className="mt-3 text-sm text-[var(--color-text-dark)]">
          「リンク」はプロフィールのリンクが押されて Facebook ページに来た回数（同じ人の 2 回目も数える）。「Facebook で相談」は Facebook ページに初めてメッセージをした人数（どの媒体から来たかは分からない）。LINE は別の窓口
          {account.role === "admin" ? (
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

      {/* 4. 媒体ごと */}
      <Card title="媒体ごと">
        <Table
          head={["", "媒体", "フォロワー", "投稿した動画", "その動画の再生", "1 本あたりの再生", "いいね", "コメント"]}
          align={["left", "left", "right", "right", "right", "right", "right", "right"]}
          rows={[...COUNTRIES, { key: "other" as const, label: "その他" }].flatMap((c) =>
            PLATFORMS.flatMap((p) => {
              const as = accts.filter((a) => a.country === c.key && a.platform === p.key);
              if (as.length === 0) return [];
              const v = cur.filter((x) => x.country === c.key && x.platform === p.key);
              const views = sum(v.map((x) => x.views));
              return [
                [
                  <span key="c" className="font-semibold">{c.label}</span>,
                  <PlatformName key="p" platform={p.key} url={as[0].url} />,
                  fmt(as.some((a) => a.followers !== null) ? sum(as.map((a) => a.followers)) : null),
                  fmt(v.length),
                  <span key="v" className="font-semibold">{fmt(views)}</span>,
                  fmt(v.length ? Math.round(views / v.length) : null),
                  fmt(sum(v.map((x) => x.likes))),
                  fmt(sum(v.map((x) => x.comments))),
                ],
              ];
            }),
          )}
        />
      </Card>

      {/* 5. 動画ごと */}
      <Card
        title={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>動画ごと（再生の多い順）</span>
            <div className="flex gap-4 text-sm font-medium">
              {[{ key: null, label: "すべて" }, ...COUNTRIES].map((c) => (
                <Link
                  key={c.label}
                  href={href({ c: c.key })}
                  className={only === c.key ? "text-[var(--color-text-dark)] underline underline-offset-4" : "text-[var(--color-primary)] hover:underline"}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        }
      >
        <Table
          head={["動画", "国", "媒体", "公開日", "再生", "いいね", "コメント", "シェア"]}
          align={["left", "left", "left", "left", "right", "right", "right", "right"]}
          empty="この期間に公開した動画はありません"
          rows={cur
            .filter((v) => !only || v.country === only)
            .sort((a, b) => b.views - a.views)
            .map((v) => [
              v.url ? (
                <a key="t" href={v.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[var(--color-primary)] hover:underline">
                  {v.title || "(本文なし)"}
                </a>
              ) : (
                <span key="t" className="line-clamp-2">{v.title || "(本文なし)"}</span>
              ),
              COUNTRIES.find((c) => c.key === v.country)?.label ?? "その他",
              <PlatformName key="p" platform={v.platform} />,
              new Date(v.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
              <span key="v" className="font-semibold">{fmt(v.views)}</span>,
              fmt(v.likes),
              fmt(v.comments),
              fmt(v.shares),
            ])}
        />
      </Card>
    </div>
  );
}

/** 数字のカード。前の期間と比べた増減を出す */
function Kpi({ label, value, prev, unit = "", strong = false }: { label: string; value: number; prev: number; unit?: string; strong?: boolean }) {
  const diff = value - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <div className={`rounded-xl px-4 py-3 ${strong ? "border-2 border-[var(--color-primary)] bg-white" : "bg-[var(--color-light)]"}`}>
      <p className="text-sm font-medium text-[var(--color-text-dark)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-dark)]">
        {fmt(value)}
        {unit ? <span className="ml-0.5 text-sm font-semibold">{unit}</span> : null}
      </p>
      <p className="mt-1 text-xs font-semibold tabular-nums">
        <span className={diff > 0 ? "text-green-700" : diff < 0 ? "text-red-700" : "text-[var(--color-text-dark)]"}>
          {diff > 0 ? "▲" : diff < 0 ? "▼" : "±"}
          {fmt(Math.abs(diff))}
          {pct !== null ? `（${diff >= 0 ? "+" : ""}${pct}%）` : ""}
        </span>
        <span className="ml-1 font-normal text-[var(--color-text-dark)]">前 {fmt(prev)}</span>
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
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
