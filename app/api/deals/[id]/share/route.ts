/**
 * 企業向けの推薦リストの共有 URL (/list/{token})。
 *   POST   … まだ無ければ作る (あればそのまま返す)
 *   DELETE … 共有をやめる (URL を開けなくする)
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: unknown) =>
  Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const id = Number((await params).id);
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id }, select: { shareToken: true } });
    const token = deal.shareToken ?? crypto.randomBytes(16).toString("hex");
    if (!deal.shareToken) await prisma.deal.update({ where: { id }, data: { shareToken: token } });
    return Response.json({ ok: true, token });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const id = Number((await params).id);
    await prisma.deal.update({ where: { id }, data: { shareToken: null } });
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
