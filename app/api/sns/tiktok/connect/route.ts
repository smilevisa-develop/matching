/**
 * TikTok との接続 (管理者のみ)。
 *   POST /api/sns/tiktok/connect  { clientKey, clientSecret }  … キーとシークレットを保存する (空なら今のまま)
 *   GET  /api/sns/tiktok/connect                              … TikTok の同意画面へ飛ばす (アカウントごとに 1 回)
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";
import { buildTiktokAuthUrl } from "@/lib/sns-tiktok";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const body = await req.json().catch(() => ({}));
    const clientKey = typeof body.clientKey === "string" ? body.clientKey.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    const data: { snsTiktokClientKey?: string; snsTiktokClientSecret?: string } = {};
    if (clientKey) data.snsTiktokClientKey = clientKey;
    if (clientSecret) data.snsTiktokClientSecret = clientSecret;
    if (Object.keys(data).length === 0) return Response.json({ ok: false, error: "クライアントキーかシークレットを入れてください" }, { status: 400 });
    await prisma.coreSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function GET() {
  try {
    await requireApiAdmin();
    const s = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { snsTiktokClientKey: true, snsTiktokClientSecret: true } });
    if (!s?.snsTiktokClientKey || !s.snsTiktokClientSecret) return Response.redirect(publicUrl("/sns?tiktok=noapp"), 302);
    const state = randomBytes(16).toString("base64url");
    const jar = await cookies();
    jar.set("sns_tiktok_state", state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
    return Response.redirect(buildTiktokAuthUrl(s.snsTiktokClientKey, state), 302);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
