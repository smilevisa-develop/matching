/**
 * チャネル別 月次送信通数 (LINE フリープラン 200通/月 等の警告用)。
 *
 *   - 月初切り替え時刻は UTC ベースの "YYYY-MM"。
 *     LINE 公式 (JST) と数時間ズレるが、実用上の警告には十分。
 *   - LINE は 1 push の text + image 1枚 = 2 通 とカウント (LINE 課金単位)
 *
 * 使い方:
 *   await incrementChannelUsage("LINE", 2);  // text 1 + image 1
 *   const used = await getMonthlyUsage("LINE");
 */

import { prisma } from "@/lib/prisma";

export type Channel = "LINE" | "Messenger" | "Email" | "WhatsApp";

/** 各チャネルの推奨 / 既定の月間上限 (フリープラン基準) */
export const CHANNEL_FREE_LIMIT: Record<Channel, number | null> = {
  LINE: 200, // LINE Official Account コミュニケーションプラン (フリー)
  Messenger: null, // 上限なし (24h 内応答 + Recurring Notifications)
  Email: 1500, // Workspace ユーザーの 1 日上限。1 日換算では大きいが目安に
  WhatsApp: null, // Cloud API はカテゴリー別の従量課金、月次上限なし
};

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * チャネル別に今月の利用通数を increment。
 * 並行送信時の競合を避けるため upsert + raw 加算。
 */
export async function incrementChannelUsage(channel: Channel, count: number = 1): Promise<void> {
  if (count <= 0) return;
  const yearMonth = currentYearMonth();
  // upsert: 無ければ作成、あれば加算
  await prisma.monthlyChannelUsage.upsert({
    where: { channel_yearMonth: { channel, yearMonth } },
    create: { channel, yearMonth, messageCount: count },
    update: { messageCount: { increment: count } },
  });
}

/** 今月のチャネル利用通数を取得 (無ければ 0) */
export async function getMonthlyUsage(channel: Channel): Promise<number> {
  const yearMonth = currentYearMonth();
  const row = await prisma.monthlyChannelUsage.findUnique({
    where: { channel_yearMonth: { channel, yearMonth } },
    select: { messageCount: true },
  });
  return row?.messageCount ?? 0;
}

/** 複数チャネルをまとめて取得 */
export async function getMonthlyUsageAll(): Promise<Record<Channel, number>> {
  const yearMonth = currentYearMonth();
  const rows = await prisma.monthlyChannelUsage.findMany({
    where: { yearMonth },
    select: { channel: true, messageCount: true },
  });
  const result: Record<Channel, number> = { LINE: 0, Messenger: 0, Email: 0, WhatsApp: 0 };
  for (const r of rows) {
    if (r.channel === "LINE" || r.channel === "Messenger" || r.channel === "Email" || r.channel === "WhatsApp") {
      result[r.channel] = r.messageCount;
    }
  }
  return result;
}
