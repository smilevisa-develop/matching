/**
 * 相談リンク (/go/[国]-[媒体]) の行き先を保存する (管理者のみ)。POST { id: URL, vn: URL }
 */
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/auth";
import { readLinkTargets } from "@/lib/sns-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: "管理者のみ" }, { status: 403 });
  }
  const targets = readLinkTargets(await req.json().catch(() => null));
  await prisma.coreSettings.upsert({ where: { id: 1 }, create: { id: 1, snsLinkTargets: targets }, update: { snsLinkTargets: targets } });
  return Response.json({ ok: true, targets });
}
