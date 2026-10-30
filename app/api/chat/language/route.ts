/** ログイン中の担当者のチャット表示言語を変える。本文: { lang: "ja" | "vi" | "id" } */
import { AuthError, requireApiAccount } from "@/lib/auth";
import { isChatLang } from "@/lib/chat-translate";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json().catch(() => null);
    if (!isChatLang(body?.lang)) {
      return Response.json({ ok: false, error: "lang は ja / vi / id のどれかです" }, { status: 400 });
    }
    await prisma.staffAccount.update({ where: { id: account.id }, data: { chatLanguage: body.lang } });
    return Response.json({ ok: true, lang: body.lang });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
