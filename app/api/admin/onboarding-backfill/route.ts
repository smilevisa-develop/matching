/**
 * 案件ステージが「内定済み」なのに内定者管理ボードに居ない人を取り込む (要ログイン)。
 *
 * GET  /api/admin/onboarding-backfill          対象を数えるだけ
 * POST /api/admin/onboarding-backfill          取り込む
 *      body: { useStageDate?: boolean }        true なら案件側の更新日時を基準日にする
 *                                              (既定は基準日なし = 期限は後から入れる)
 *
 * 基準日が無いタスクは期限なしで作られる。内定承諾日を入れたあとに
 * 「申請種別で作り直す」を押せば、その日付を起点に期限が入る。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensureOnboardingCard, OFFER_STAGE } from "@/lib/onboarding-autolink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function findMissing() {
  const offered = await prisma.dealCandidate.findMany({
    where: { stage: OFFER_STAGE },
    select: {
      personId: true,
      updatedAt: true,
      person: { select: { name: true } },
      deal: { select: { company: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const existing = new Set(
    (await prisma.personPlacement.findMany({ select: { personId: true } })).map((p) => p.personId),
  );
  // 同じ人が複数案件で内定済みのことがあるので、人単位にまとめる
  const seen = new Set<number>();
  return offered.filter((o) => {
    if (existing.has(o.personId) || seen.has(o.personId)) return false;
    seen.add(o.personId);
    return true;
  });
}

export async function GET() {
  try {
    await requireApiAccount();
    const missing = await findMissing();
    return Response.json({
      ok: true,
      count: missing.length,
      persons: missing.map((m) => ({
        personId: m.personId,
        name: m.person.name,
        company: m.deal.company.name,
        stageDate: m.updatedAt.toISOString().slice(0, 10),
      })),
    });
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
    const useStageDate = body?.useStageDate === true;
    const missing = await findMissing();

    const added: { personId: number; name: string }[] = [];
    for (const m of missing) {
      const base = useStageDate ? m.updatedAt : null;
      const r = await ensureOnboardingCard(m.personId, base);
      if (r.created) added.push({ personId: m.personId, name: m.person.name });
    }
    return Response.json({ ok: true, added: added.length, persons: added, baseDate: useStageDate ? "案件の更新日" : "空白" });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
