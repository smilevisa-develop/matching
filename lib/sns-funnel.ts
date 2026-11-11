/**
 * SNS から相談につながった数 (2026/11)。
 *
 * 1. SNS のプロフィールには、媒体ごとの相談リンク /go/[国]-[媒体] (例: /go/id-tiktok) を貼る。
 *    押されたら SnsLinkClick に記録して、国ごとの行き先 (相談用の LINE など。CoreSettings.snsLinkTargets) へ飛ばす。
 * 2. 相談用の LINE アカウントと SNS 用の Facebook ページに新しい人が来たら、LINE→Slack 転送の Apps Script が /api/sns/inquiry に知らせ、SnsInquiry に人ごとに 1 件残す。
 * SNS ページで「リンクが押された数」と「相談を始めた人数」を国・媒体ごとに出す
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
  { key: "facebook", label: "Facebook" },
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
  inquiries: Record<FunnelCountry, number>;
};

/** 直近 days 日の、国・媒体ごとのクリック数と、国ごとの相談を始めた人数 */
export async function getFunnelCounts(days: number): Promise<FunnelCounts> {
  const since = new Date(Date.now() - days * 86400_000);
  const [clicks, inquiries] = await Promise.all([
    prisma.snsLinkClick.groupBy({ by: ["country", "platform"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.snsInquiry.groupBy({ by: ["country"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const zero = () => ({ tiktok: 0, instagram: 0, youtube: 0, facebook: 0 });
  const out: FunnelCounts = { days, clicks: { id: zero(), vn: zero() }, inquiries: { id: 0, vn: 0 } };
  for (const c of clicks) if (isCountry(c.country) && isPlatform(c.platform)) out.clicks[c.country][c.platform] = c._count._all;
  for (const i of inquiries) if (isCountry(i.country)) out.inquiries[i.country] = i._count._all;
  return out;
}
