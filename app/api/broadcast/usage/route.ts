/**
 * 今月の チャネル別 送信通数 + プラン上限 を返す。
 *
 * /broadcast 画面で「今月の LINE 利用: X/200」を表示するため。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { CHANNEL_FREE_LIMIT, getMonthlyUsageAll, type Channel } from "@/lib/channel-usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAccount();
    const usage = await getMonthlyUsageAll();
    const channels: Channel[] = ["LINE", "Messenger", "Email", "WhatsApp"];
    const data = channels.map((c) => ({
      channel: c,
      used: usage[c],
      limit: CHANNEL_FREE_LIMIT[c],
    }));
    return Response.json({ ok: true, usage: data });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
