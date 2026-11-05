/**
 * Meta との接続 (管理者のみ)。
 *   POST /api/sns/meta/connect  { appId, appSecret }  … アプリ ID とシークレットを保存する (空なら今のまま)
 *   GET  /api/sns/meta/connect                        … Facebook の同意画面へ飛ばす
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";
import { buildMetaAuthUrl } from "@/lib/sns-meta-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const META_STATE_COOKIE = "sns_meta_state";

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const body = await req.json().catch(() => ({}));
    const appId = typeof body.appId === "string" ? body.appId.trim() : "";
    const appSecret = typeof body.appSecret === "string" ? body.appSecret.trim() : "";
    const data: { snsMetaAppId?: string; snsMetaAppSecret?: string } = {};
    if (appId) data.snsMetaAppId = appId;
    if (appSecret) data.snsMetaAppSecret = appSecret;
    if (Object.keys(data).length === 0) return Response.json({ ok: false, error: "アプリ ID かシークレットを入れてください" }, { status: 400 });
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
    const s = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { snsMetaAppId: true, snsMetaAppSecret: true } });
    if (!s?.snsMetaAppId || !s.snsMetaAppSecret) {
      return Response.redirect(new URL("/settings?meta=noapp", process.env.PUBLIC_BASE_URL ?? "https://matching.smilereach.jp"), 302);
    }
    const state = randomBytes(16).toString("base64url");
    const jar = await cookies();
    jar.set(META_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
    return Response.redirect(buildMetaAuthUrl(s.snsMetaAppId, state), 302);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
