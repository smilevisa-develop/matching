/** ログイン中の担当者のトークのピン留めを付け外しする。本文: { partnerId: number, pinned: boolean } */
import { AuthError, requireApiAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json().catch(() => null);
    const partnerId = Number(body?.partnerId);
    if (!Number.isInteger(partnerId) || partnerId <= 0 || typeof body?.pinned !== "boolean") {
      return Response.json({ ok: false, error: "partnerId と pinned が必要です" }, { status: 400 });
    }
    const key = { accountId_partnerId: { accountId: account.id, partnerId } };
    if (body.pinned) {
      await prisma.chatPin.upsert({ where: key, update: {}, create: { accountId: account.id, partnerId } });
    } else {
      await prisma.chatPin.deleteMany({ where: { accountId: account.id, partnerId } });
    }
    return Response.json({ ok: true, partnerId, pinned: body.pinned });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status });
  }
}
