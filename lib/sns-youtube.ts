/**
 * SNS の数字 (YouTube)。候補者向けに投稿している動画の再生数などを SMILE MATCHING で見る。
 *
 * YouTube Data API v3 を API キーで呼ぶ (公開の数字だけ。視聴時間や流入元はチャンネル所有者の OAuth が要るので対象外)。
 *   YOUTUBE_API_KEY     … Google Cloud の API キー
 *   YOUTUBE_CHANNEL_IDS … 見るチャンネル (CSV。UC… の ID)
 * 1 日の無料枠は 10,000 ユニット。1 チャンネルの取得は 3〜4 ユニットなので、1 時間キャッシュで十分足りる。
 */

import { unstable_cache } from "next/cache";

export type YoutubeVideo = {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
};

export type YoutubeChannel = {
  id: string;
  title: string;
  handle: string | null;
  url: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  videos: YoutubeVideo[];
};

const API = "https://www.googleapis.com/youtube/v3";

export function youtubeChannelIds(): string[] {
  return (process.env.YOUTUBE_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim()) && youtubeChannelIds().length > 0;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YOUTUBE_API_KEY が未設定です");
  const q = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${q}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

const n = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) || 0 : 0);

async function fetchChannel(channelId: string, maxVideos: number): Promise<YoutubeChannel> {
  type ChannelsRes = {
    items?: {
      id: string;
      snippet?: { title?: string; customUrl?: string };
      statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  };
  const ch = await call<ChannelsRes>("channels", { part: "snippet,statistics,contentDetails", id: channelId });
  const c = ch.items?.[0];
  if (!c) throw new Error(`チャンネルが見つかりません: ${channelId}`);
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;

  let videos: YoutubeVideo[] = [];
  if (uploads) {
    type PlaylistRes = { items?: { contentDetails?: { videoId?: string } }[] };
    const pl = await call<PlaylistRes>("playlistItems", {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: String(Math.min(50, maxVideos)),
    });
    const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      type VideosRes = {
        items?: {
          id: string;
          snippet?: { title?: string; publishedAt?: string };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        }[];
      };
      const vs = await call<VideosRes>("videos", { part: "snippet,statistics", id: ids.join(",") });
      videos = (vs.items ?? []).map((v) => ({
        id: v.id,
        title: v.snippet?.title ?? "",
        publishedAt: v.snippet?.publishedAt ?? "",
        views: n(v.statistics?.viewCount),
        likes: n(v.statistics?.likeCount),
        comments: n(v.statistics?.commentCount),
        url: `https://www.youtube.com/watch?v=${v.id}`,
      }));
      videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
  }
  const handle = c.snippet?.customUrl ?? null;
  return {
    id: c.id,
    title: c.snippet?.title ?? c.id,
    handle,
    url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${c.id}`,
    subscribers: n(c.statistics?.subscriberCount),
    totalViews: n(c.statistics?.viewCount),
    videoCount: n(c.statistics?.videoCount),
    videos,
  };
}

/** 設定した全チャンネルの数字。失敗したチャンネルは error に入れて、ほかは出す。1 時間キャッシュ */
export const getYoutubeStats = unstable_cache(
  async (): Promise<{ channels: YoutubeChannel[]; errors: { id: string; error: string }[] }> => {
    const channels: YoutubeChannel[] = [];
    const errors: { id: string; error: string }[] = [];
    for (const id of youtubeChannelIds()) {
      try {
        channels.push(await fetchChannel(id, 50));
      } catch (e) {
        errors.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { channels, errors };
  },
  ["youtube-stats"],
  { revalidate: 3600 },
);
