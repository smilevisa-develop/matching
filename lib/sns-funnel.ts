/**
 * SNS から相談につながった数 (2026/11)。
 *
 * 1. SNS のプロフィールには、媒体ごとの相談リンク /go/[国]-[媒体] (例: /go/id-tiktok) を貼る。
 *    押されたら SnsLinkClick に記録して、国ごとの行き先 (相談用の LINE など。CoreSettings.snsLinkTargets) へ飛ばす。
 * 2. 相談用の LINE アカウントと SNS 用の Facebook ページに新しい人が来たら、LINE→Slack 転送の Apps Script が /api/sns/inquiry に知らせ、SnsInquiry に人ごとに 1 件残す。
 * SNS ページで「リンクが押された数」と「相談を始めた人数」を国・媒体ごとに出す。
 * 相談の窓口は Facebook ページ (Messenger)。LINE は別の窓口なので、人数は分けて出す。
 * 相談リンクの行き先が Facebook ページなので、Facebook 用のリンクは作らない
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const FUNNEL_COUNTRIES = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
] as const;
export const FUNNEL_PLATFORMS = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
] as const;
export type FunnelCountry = (typeof FUNNEL_COUNTRIES)[number]["key"];
export type FunnelPlatform = (typeof FUNNEL_PLATFORMS)[number]["key"];

export const isCountry = (v: unknown): v is FunnelCountry => FUNNEL_COUNTRIES.some((c) => c.key === v);
export const isPlatform = (v: unknown): v is FunnelPlatform => FUNNEL_PLATFORMS.some((p) => p.key === v);

/** 相談リンクの行き先 { id, vn }。入っていない国は空文字 */
export function readLinkTargets(value: unknown): Record<FunnelCountry, string> {
  const o = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const url = (v: unknown) => (typeof v === "string" && /^https?:\/\//.test(v.trim()) ? v.trim() : "");
  return { id: url(o.id), vn: url(o.vn) };
}

export async function getLinkTargets(): Promise<Record<FunnelCountry, string>> {
  const s = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { snsLinkTargets: true } });
  return readLinkTargets(s?.snsLinkTargets);
}

/** LINE の userId は持たず、ハッシュだけ残す */
export const userKeyOf = (userId: string) => createHash("sha256").update(userId).digest("hex").slice(0, 32);

export type FunnelCounts = {
  days: number;
  clicks: Record<FunnelCountry, Record<FunnelPlatform, number>>;
  /** 相談を始めた人数。Messenger = Facebook ページ (相談の窓口)、LINE = 別の窓口 */
  inquiries: Record<FunnelCountry, { Messenger: number; LINE: number }>;
};

/** 直近 days 日 (offsetDays を渡すと、その日数だけ前にずらした days 日) の、国・媒体ごとのクリック数と、国ごとの相談を始めた人数 */
export async function getFunnelCounts(days: number, offsetDays = 0): Promise<FunnelCounts> {
  const until = new Date(Date.now() - offsetDays * 86400_000);
  const since = new Date(until.getTime() - days * 86400_000);
  const range = { gte: since, lt: until };
  const [clicks, inquiries] = await Promise.all([
    prisma.snsLinkClick.groupBy({ by: ["country", "platform"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.snsInquiry.groupBy({ by: ["country", "channel"], where: { createdAt: range }, _count: { _all: true } }),
  ]);
  const zero = () => ({ tiktok: 0, instagram: 0, youtube: 0 });
  const none = () => ({ Messenger: 0, LINE: 0 });
  const out: FunnelCounts = { days, clicks: { id: zero(), vn: zero() }, inquiries: { id: none(), vn: none() } };
  for (const c of clicks) if (isCountry(c.country) && isPlatform(c.platform)) out.clicks[c.country][c.platform] = c._count._all;
  for (const i of inquiries) {
    if (isCountry(i.country) && (i.channel === "Messenger" || i.channel === "LINE")) out.inquiries[i.country][i.channel] = i._count._all;
  }
  return out;
}
