/**
 * 案件ボードの管理: 案件をボードに出す項目を保存する / 公開・締切・外す (要ログイン)。
 * PATCH { boardTitle, boardArea, ..., boardStatus? }
 * 公開 (open) にするには、案件名・地域と、職業安定法で募集時に示す 3 項目が必要。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { missingForOpen } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 文字列なら整えて返す (空なら null = 消す)。文字列でなければ undefined = 変えない */
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) || null : undefined);
const intOrNull = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const dealId = Number(id);
    const body = await req.json().catch(() => ({}));

    const current = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, boardStatus: true, boardPublishedAt: true, company: { select: { name: true } } },
    });
    if (!current) return Response.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });

    const requirements =
      typeof body?.boardRequirements === "string"
        ? body.boardRequirements
            .split(/\r?\n/)
            .map((s: string) => s.trim())
            .filter(Boolean)
            .slice(0, 20)
        : undefined;

    const data = {
      boardTitle: str(body?.boardTitle, 120),
      boardArea: str(body?.boardArea, 120),
      boardSummary: str(body?.boardSummary),
      boardPartnerFee: str(body?.boardPartnerFee, 200),
      boardJobChangeScope: str(body?.boardJobChangeScope, 300),
      boardPlaceChangeScope: str(body?.boardPlaceChangeScope, 300),
      boardRenewalLimit: str(body?.boardRenewalLimit, 300),
      ...(requirements ? { boardRequirements: requirements } : {}),
      ...("boardPerPartnerLimit" in (body ?? {}) ? { boardPerPartnerLimit: intOrNull(body.boardPerPartnerLimit) ?? 2 } : {}),
      ...("boardTotalLimit" in (body ?? {}) ? { boardTotalLimit: intOrNull(body.boardTotalLimit) } : {}),
      ...(typeof body?.deadline === "string"
        ? { deadline: /^\d{4}-\d{2}-\d{2}$/.test(body.deadline) ? new Date(`${body.deadline}T00:00:00+09:00`) : null }
        : {}),
    };

    // 会社名をボードの文章に入れない (パートナーに見えてしまう)
    const companyName = current.company.name.trim();
    if (companyName && [data.boardTitle, data.boardSummary].some((t) => t && t.includes(companyName))) {
      return Response.json({ ok: false, error: "案件名かポイントに会社名が入っています。外してください。" }, { status: 400 });
    }

    const nextStatus = typeof body?.boardStatus === "string" ? body.boardStatus : undefined;
    if (nextStatus && !["hidden", "open", "closed"].includes(nextStatus)) {
      return Response.json({ ok: false, error: "公開状態が正しくありません" }, { status: 400 });
    }

    const saved = await prisma.deal.update({
      where: { id: dealId },
      data,
      select: { boardTitle: true, boardArea: true, boardJobChangeScope: true, boardPlaceChangeScope: true, boardRenewalLimit: true },
    });

    if (nextStatus) {
      if (nextStatus === "open") {
        const missing = missingForOpen(saved);
        if (missing.length) {
          return Response.json({ ok: false, error: `公開に必要な項目が空です: ${missing.join("、")}（入力は保存しました）` }, { status: 400 });
        }
      }
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          boardStatus: nextStatus,
          ...(nextStatus === "open" && !current.boardPublishedAt ? { boardPublishedAt: new Date() } : {}),
        },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
