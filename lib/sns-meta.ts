/**
 * SNS の数字 (Facebook ページ / Instagram)。
 *
 * Meta Graph API を、ページを管理している人のユーザートークンで呼ぶ (アプリ「株式会社CROSLAN」で発行)。
 * トークンは SNS ページの「Meta と接続」で取って CoreSettings に保存する (約 60 日で切れる。切れたらもう一度接続する)
 * トークンから見えるページ全部と、そのページに紐づく Instagram を出す。
 * Messenger 連携のトークン (FB_PAGE_ACCESS_TOKEN) は別のアプリ・別のページなので使わない。
 */

import { unstable_cache } from "next/cache";
import { getMetaToken } from "@/lib/sns-meta-connect";

export type MetaPost = {
  id: string;
  text: string;
  publishedAt: string;
  url: string | null;
  /** 再生数 (動画・リール。取れなければ null) */
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export type MetaPage = {
  id: string;
  name: string;
  url: string;
  followers: number | null;
  posts: MetaPost[];
  instagram: {
    id: string;
    username: string;
    url: string;
    followers: number | null;
    mediaCount: number | null;
    posts: MetaPost[];
  } | null;
};

const API = "https://graph.facebook.com/v21.0";

export async function metaConfigured(): Promise<boolean> {
  return Boolean(await getMetaToken());
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await getMetaToken();
  if (!token) throw new Error("Meta と接続していません");
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${API}/${path}?${q}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Meta API ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

const n = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);

type Summary = { summary?: { total_count?: number } };
type FbReelRaw = { id: string; description?: string; updated_time?: string; permalink_url?: string; views?: number; likes?: Summary; comments?: Summary };
type FbPostRaw = { id: string; message?: string; created_time?: string; permalink_url?: string; shares?: { count?: number }; likes?: Summary; comments?: Summary };
const SUMMARIES = ",likes.summary(true).limit(0),comments.summary(true).limit(0)";
const cnt = (s?: Summary): number | null => (typeof s?.summary?.total_count === "number" ? s.summary.total_count : null);

/**
 * Facebook ページの投稿 (直近 25 件)。
 * 動画はリール (video_reels) で再生数が取れる。いいね・コメントの数は pages_read_user_content が要る (無いトークンなら null)。
 * リール以外の投稿は posts から
 */
async function fetchFbPosts(pageId: string, pageToken: string): Promise<MetaPost[]> {
  const get = async <T,>(path: string, fields: string) => {
    const q = new URLSearchParams({ fields, limit: "25", access_token: pageToken });
    const res = await fetch(`${API}/${pageId}/${path}?${q}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { data?: T[]; error?: { message?: string } };
    if (json.error) throw new Error(`Meta API ${path}: ${json.error.message}`);
    return json.data ?? [];
  };
  // いいね・コメントの数は権限が無いと丸ごとエラーになるので、だめなら無しで取り直す
  const getWithSummaries = <T,>(path: string, fields: string) => get<T>(path, fields + SUMMARIES).catch(() => get<T>(path, fields));
  const reels = await getWithSummaries<FbReelRaw>("video_reels", "id,description,updated_time,permalink_url,views");
  const posts: MetaPost[] = reels.map((r) => ({
    id: r.id,
    text: (r.description ?? "").slice(0, 80),
    publishedAt: r.updated_time ?? "",
    url: r.permalink_url ? `https://www.facebook.com${r.permalink_url}` : null,
    views: typeof r.views === "number" ? r.views : null,
    likes: cnt(r.likes),
    comments: cnt(r.comments),
    shares: null,
  }));
  // リール以外の投稿 (リールと同じ文章のものは重ねて出さない)
  const texts = new Set(posts.map((p) => p.text));
  const plain = await getWithSummaries<FbPostRaw>("posts", "id,message,created_time,permalink_url,shares").catch(() => []);
  for (const p of plain) {
    const text = (p.message ?? "").slice(0, 80);
    // 文章の無い投稿 (リールや写真の自動投稿) と、リールと同じ文章のものは重ねて出さない
    if (!text || texts.has(text)) continue;
    posts.push({ id: p.id, text, publishedAt: p.created_time ?? "", url: p.permalink_url ?? null, views: null, likes: cnt(p.likes), comments: cnt(p.comments), shares: p.shares?.count ?? null });
  }
  posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return posts;
}

type IgMediaRaw = {
  id: string;
  caption?: string;
  media_type?: string;
  timestamp?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data?: { name?: string; values?: { value?: unknown }[] }[] };
};

/** Instagram の投稿 (直近 25 件)。再生数はリール・動画の views (取れなければ null) */
async function fetchIgPosts(igId: string, pageToken: string): Promise<MetaPost[]> {
  const q = new URLSearchParams({
    fields: "id,caption,media_type,timestamp,permalink,like_count,comments_count",
    limit: "25",
    access_token: pageToken,
  });
  const res = await fetch(`${API}/${igId}/media?${q}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { data?: IgMediaRaw[]; error?: { message?: string } };
  if (json.error) throw new Error(`Meta API media: ${json.error.message}`);
  const posts: MetaPost[] = [];
  for (const m of json.data ?? []) {
    // 再生数は instagram_manage_insights が要る。無いトークンなら null のまま
    let views: number | null = null;
    if (m.media_type === "VIDEO" || m.media_type === "REELS") {
      const iq = new URLSearchParams({ metric: "views", access_token: pageToken });
      const ir = await fetch(`${API}/${m.id}/insights?${iq}`, { cache: "no-store" }).catch(() => null);
      const ij = ir ? ((await ir.json().catch(() => ({}))) as { data?: { values?: { value?: unknown }[] }[] }) : {};
      const v = ij.data?.[0]?.values?.[0]?.value;
      if (typeof v === "number") views = v;
    }
    posts.push({
      id: m.id,
      text: (m.caption ?? "").slice(0, 80),
      publishedAt: m.timestamp ?? "",
      url: m.permalink ?? null,
      views,
      likes: n(m.like_count),
      comments: n(m.comments_count),
      shares: null,
    });
  }
  return posts;
}

/** トークンから見えるページ全部の数字。失敗したページは error に入れて、ほかは出す。1 時間キャッシュ */
export const getMetaStats = unstable_cache(
  async (): Promise<{ pages: MetaPage[]; errors: { id: string; error: string }[] }> => {
    type AccountsRes = {
      data?: {
        id: string;
        name: string;
        access_token: string;
        followers_count?: number;
        link?: string;
        instagram_business_account?: { id: string; username?: string; followers_count?: number; media_count?: number };
      }[];
    };
    const pages: MetaPage[] = [];
    const errors: { id: string; error: string }[] = [];
    const accounts = await call<AccountsRes>("me/accounts", {
      fields: "id,name,access_token,followers_count,link,instagram_business_account{id,username,followers_count,media_count}",
      limit: "50",
    });
    for (const a of accounts.data ?? []) {
      try {
        const ig = a.instagram_business_account;
        pages.push({
          id: a.id,
          name: a.name,
          url: a.link ?? `https://www.facebook.com/${a.id}`,
          followers: typeof a.followers_count === "number" ? a.followers_count : null,
          posts: await fetchFbPosts(a.id, a.access_token),
          instagram: ig
            ? {
                id: ig.id,
                username: ig.username ?? ig.id,
                url: `https://www.instagram.com/${ig.username ?? ""}`,
                followers: typeof ig.followers_count === "number" ? ig.followers_count : null,
                mediaCount: typeof ig.media_count === "number" ? ig.media_count : null,
                posts: await fetchIgPosts(ig.id, a.access_token),
              }
            : null,
        });
      } catch (e) {
        errors.push({ id: `${a.name} (${a.id})`, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { pages, errors };
  },
  ["meta-stats"],
  { revalidate: 3600, tags: ["meta-stats"] },
);
