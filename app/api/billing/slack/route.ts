/**
 * POST /api/billing/slack { text }  請求スレッドを Slack に立てる (川村さんへの請求書の発行依頼)
 * POST /api/billing/slack { text, kind: "pay", personIds }  パートナーのチャンネルに振込のお願いを出す
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { postBillingThread, postTransferList } from "@/lib/billing-slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const { text, kind, personIds } = await req.json().catch(() => ({}));
    if (typeof text !== "string" || !text.trim())
      return Response.json(
        { ok: false, error: "投稿する内容がありません" },
        { status: 400 },
      );
    const r =
      kind === "pay"
        ? await postTransferList(
            text,
            (Array.isArray(personIds) ? personIds : [])
              .map(Number)
              .filter((n: number) => Number.isInteger(n) && n > 0),
          )
        : await postBillingThread(text);
    return Response.json({ ok: true, ...r });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
