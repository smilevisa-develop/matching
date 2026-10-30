/**
 * チャット画面で、訳がまだ無いメッセージを担当者の表示言語に訳す (過去分・失敗分の補完)。
 * 本文: { ids: number[] }  (最大 60 件)
 */
import { AuthError, requireApiAccount } from "@/lib/auth";
import { getChatLanguage } from "@/lib/chat-messages";
import { translateMessages } from "@/lib/chat-translate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? [...new Set((body.ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60)
      : [];
    const lang = await getChatLanguage(account.id);
    const result = await translateMessages(ids, lang);
    return Response.json({ ok: true, lang, ...result });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
