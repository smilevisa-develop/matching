/**
 * ログイン中の担当者のトークのピン留めを付け外しする。
 * 本文: { key: "p:<partnerId>" | "g:<groupId>", pinned: boolean }
 */
import { AuthError, requireApiAccount } from "@/lib/auth";
import { parseConvKey } from "@/lib/chat-messages";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json().catch(() => null);
    const target = parseConvKey(body?.key);
    if (!target || typeof body?.pinned !== "boolean") {
      return Response.json({ ok: false, error: "key と pinned が必要です" }, { status: 400 });
    }
    const data =
      "partnerId" in target
        ? { accountId: account.id, partnerId: target.partnerId }
        : { accountId: account.id, lineGroupId: target.groupId };
    if (body.pinned) {
      if (!(await prisma.chatPin.findFirst({ where: data }))) await prisma.chatPin.create({ data });
    } else {
      await prisma.chatPin.deleteMany({ where: data });
    }
    return Response.json({ ok: true, key: body.key, pinned: body.pinned });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
