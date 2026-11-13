/**
 * POST /api/billing/slack { text }  請求スレッドを Slack に立てる (川村さんへの請求書の発行依頼)
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { postBillingThread } from "@/lib/billing-slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const { text } = await req.json().catch(() => ({}));
    if (typeof text !== "string" || !text.trim()) return Response.json({ ok: false, error: "投稿する内容がありません" }, { status: 400 });
    const r = await postBillingThread(text);
    return Response.json({ ok: true, ...r });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
