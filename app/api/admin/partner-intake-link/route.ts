/**
 * 新規パートナー向け「自己記入フォーム」の共有リンクを返す (要ログイン)。
 *
 * GET /api/admin/partner-intake-link
 *   → { ok, url }  トークンが無ければ作って保存する (全員共通の 1 本のリンク)
 * POST /api/admin/partner-intake-link  { rotate: true }
 *   → リンクを作り直す (漏れたときに古いリンクを無効にする)
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureToken(rotate: boolean): Promise<string> {
  const current = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { partnerIntakeToken: true } });
  if (current?.partnerIntakeToken && !rotate) return current.partnerIntakeToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.coreSettings.upsert({
    where: { id: 1 },
    create: { id: 1, partnerIntakeToken: token },
    update: { partnerIntakeToken: token },
  });
  return token;
}

export async function GET() {
  try {
    await requireApiAccount();
    const token = await ensureToken(false);
    return Response.json({ ok: true, url: publicUrl(`/partner-intake/${token}`) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const token = await ensureToken(Boolean(body?.rotate));
    return Response.json({ ok: true, url: publicUrl(`/partner-intake/${token}`) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
