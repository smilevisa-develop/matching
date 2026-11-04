/**
 * SNS の数字 (TikTok)。候補者向けに投稿している動画の再生数などを SMILE MATCHING で見る。
 *
 * TikTok for Developers のアプリ「SMILE MATCHING SNS」(Login Kit + Display API)。
 * クライアントキーとシークレットは CoreSettings に保存し、「TikTok と接続」で各アカウント (croslanvietnam など) の
 * トークンを取る。アクセストークンは 24 時間、リフレッシュトークンは 365 日。読むたびに期限が近ければ更新する。
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";

export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];
export const TIKTOK_CALLBACK_PATH = "/api/sns/tiktok/callback";

export type TiktokAccountToken = {
  openId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  /** アクセストークンの期限 (ISO) */
  expiresAt: string;
  /** リフレッシュトークンの期限 (ISO) */
  refreshExpiresAt: string;
};

export type TiktokVideo = {
  id: string;
  title: string;
  publishedAt: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

export type TiktokAccount = {
  openId: string;
  displayName: string;
  url: string | null;
  followers: number | null;
  likes: number | null;
  videoCount: number | null;
  videos: TiktokVideo[];
};

function readAccounts(value: unknown): TiktokAccountToken[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is TiktokAccountToken =>
      !!a && typeof a === "object" && typeof (a as TiktokAccountToken).openId === "string" && typeof (a as TiktokAccountToken).accessToken === "string",
  );
}

export async function getTiktokConnection() {
  const s = await prisma.coreSettings.findUnique({
    where: { id: 1 },
    select: { snsTiktokClientKey: true, snsTiktokClientSecret: true, snsTiktokAccounts: true },
  });
  return {
    clientKey: s?.snsTiktokClientKey ?? null,
    hasSecret: Boolean(s?.snsTiktokClientSecret),
    accounts: readAccounts(s?.snsTiktokAccounts).map((a) => ({ openId: a.openId, displayName: a.displayName, refreshExpiresAt: a.refreshExpiresAt })),
  };
}

export function buildTiktokAuthUrl(clientKey: string, state: string): string {
  const q = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: publicUrl(TIKTOK_CALLBACK_PATH),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

type TokenRes = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenRes> {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({}))) as TokenRes;
}

async function saveAccounts(accounts: TiktokAccountToken[]) {
  await prisma.coreSettings.upsert({
    where: { id: 1 },
    create: { id: 1, snsTiktokAccounts: accounts },
    update: { snsTiktokAccounts: accounts },
  });
  revalidateTag("tiktok-stats", "max");
}

/** 同意画面から戻った code でトークンを取り、アカウントを保存する (同じ open_id なら上書き) */
export async function exchangeCodeAndSave(code: string): Promise<{ displayName: string }> {
  const s = await prisma.coreSettings.findUnique({
    where: { id: 1 },
    select: { snsTiktokClientKey: true, snsTiktokClientSecret: true, snsTiktokAccounts: true },
  });
  if (!s?.snsTiktokClientKey || !s.snsTiktokClientSecret) throw new Error("TikTok のクライアントキーとシークレットが未設定です");
  const t = await tokenRequest({
    client_key: s.snsTiktokClientKey,
    client_secret: s.snsTiktokClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: publicUrl(TIKTOK_CALLBACK_PATH),
  });
  if (!t.access_token || !t.refresh_token || !t.open_id) throw new Error(`トークンの取得に失敗: ${t.error_description ?? t.error ?? "不明"}`);
  const info = await fetchUserInfo(t.access_token).catch(() => null);
  const account: TiktokAccountToken = {
    openId: t.open_id,
    displayName: info?.displayName ?? t.open_id,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + (t.refresh_expires_in ?? 365 * 86400) * 1000).toISOString(),
  };
  const others = readAccounts(s.snsTiktokAccounts).filter((a) => a.openId !== account.openId);
  await saveAccounts([...others, account]);
  return { displayName: account.displayName };
}

/** 期限が近いアクセストークンを更新して返す (更新できなければそのまま) */
async function freshToken(a: TiktokAccountToken, clientKey: string, clientSecret: string): Promise<TiktokAccountToken> {
  if (new Date(a.expiresAt).getTime() - Date.now() > 10 * 60_000) return a;
  const t = await tokenRequest({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: a.refreshToken });
  if (!t.access_token) return a;
  return {
    ...a,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? a.refreshToken,
    expiresAt: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(),
    refreshExpiresAt: t.refresh_expires_in ? new Date(Date.now() + t.refresh_expires_in * 1000).toISOString() : a.refreshExpiresAt,
  };
}

async function fetchUserInfo(accessToken: string) {
  const q = new URLSearchParams({ fields: "open_id,display_name,profile_deep_link,follower_count,likes_count,video_count" });
  const res = await fetch(`https://open.tiktokapis.com/v2/user/info/?${q}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { user?: { display_name?: string; profile_deep_link?: string; follower_count?: number; likes_count?: number; video_count?: number } };
    error?: { code?: string; message?: string };
  };
  if (json.error?.code && json.error.code !== "ok") throw new Error(`TikTok API user/info: ${json.error.message ?? json.error.code}`);
  const u = json.data?.user ?? {};
  return {
    displayName: u.display_name ?? "",
    url: u.profile_deep_link ?? null,
    followers: typeof u.follower_count === "number" ? u.follower_count : null,
    likes: typeof u.likes_count === "number" ? u.likes_count : null,
    videoCount: typeof u.video_count === "number" ? u.video_count : null,
  };
}

async function fetchVideos(accessToken: string): Promise<TiktokVideo[]> {
  const q = new URLSearchParams({ fields: "id,title,create_time,share_url,view_count,like_count,comment_count,share_count" });
  const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?${q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 20 }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: {
      videos?: { id: string; title?: string; create_time?: number; share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[];
    };
    error?: { code?: string; message?: string };
  };
  if (json.error?.code && json.error.code !== "ok") throw new Error(`TikTok API video/list: ${json.error.message ?? json.error.code}`);
  return (json.data?.videos ?? []).map((v) => ({
    id: v.id,
    title: (v.title ?? "").slice(0, 80),
    publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : "",
    url: v.share_url ?? "",
    views: v.view_count ?? 0,
    likes: v.like_count ?? 0,
    comments: v.comment_count ?? 0,
    shares: v.share_count ?? 0,
  }));
}

/** 接続した全アカウントの数字。失敗したアカウントは error に入れて、ほかは出す。1 時間キャッシュ */
export const getTiktokStats = unstable_cache(
  async (): Promise<{ accounts: TiktokAccount[]; errors: { id: string; error: string }[] }> => {
    const s = await prisma.coreSettings.findUnique({
      where: { id: 1 },
      select: { snsTiktokClientKey: true, snsTiktokClientSecret: true, snsTiktokAccounts: true },
    });
    const stored = readAccounts(s?.snsTiktokAccounts);
    const accounts: TiktokAccount[] = [];
    const errors: { id: string; error: string }[] = [];
    const refreshed: TiktokAccountToken[] = [];
    let changed = false;
    for (const a of stored) {
      try {
        const fresh = s?.snsTiktokClientKey && s.snsTiktokClientSecret ? await freshToken(a, s.snsTiktokClientKey, s.snsTiktokClientSecret) : a;
        if (fresh !== a) changed = true;
        refreshed.push(fresh);
        const info = await fetchUserInfo(fresh.accessToken);
        accounts.push({ openId: a.openId, displayName: info.displayName || a.displayName, url: info.url, followers: info.followers, likes: info.likes, videoCount: info.videoCount, videos: await fetchVideos(fresh.accessToken) });
      } catch (e) {
        refreshed.push(a);
        errors.push({ id: a.displayName, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (changed) {
      await prisma.coreSettings.update({ where: { id: 1 }, data: { snsTiktokAccounts: refreshed } });
    }
    return { accounts, errors };
  },
  ["tiktok-stats"],
  { revalidate: 3600, tags: ["tiktok-stats"] },
);
