/**
 * チャットの入力欄で、送る前の文を相手の言語に訳す (送信はしない。画面で確かめてから送る)。
 * 本文: { text: string, target: "ja" | "vi" | "id" | "en" | "my" | "ne" | "km" }
 */
import { AuthError, requireApiAccount } from "@/lib/auth";
import { getChatLanguage } from "@/lib/chat-messages";
import { isDraftLang } from "@/lib/chat-languages";
import { translateDraft } from "@/lib/chat-translate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
    if (!text) return Response.json({ ok: false, error: "文が空です" }, { status: 400 });
    if (!isDraftLang(body?.target)) return Response.json({ ok: false, error: "訳す言語が不正です" }, { status: 400 });
    const staffLang = await getChatLanguage(account.id);
    const result = await translateDraft(text, body.target, staffLang);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
