/**
 * 企業との商談の議事録 (Notta) (要ログイン)。
 *
 * GET  /api/companies/[id]/meeting-notes   保存済みの議事録 (新しい順)
 * POST /api/companies/[id]/meeting-notes   「この会社の議事録を探す」: 議事録スプシからタイトルに企業名を含む行を探して保存する
 *        返り値: { ok, found: 見つかった件数, added: 新しく保存した件数, searchedFor: 探した企業名, notes }
 *
 * 取り込みの流れは lib/meeting-notes.ts と docs/notta-zapier-setup.md を参照。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { companySearchKey, readMeetingSheet, titleMatchesCompany } from "@/lib/meeting-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listNotes(companyId: number) {
  const notes = await prisma.meetingNote.findMany({
    where: { companyId, dismissedAt: null },
    orderBy: [{ meetingAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  });
  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    meetingAt: n.meetingAt?.toISOString() ?? null,
    meetingAtText: n.meetingAtText,
    summary: n.summary,
    transcript: n.transcript,
    url: n.url,
  }));
}

function parseCompanyId(id: string) {
  const companyId = Number(id);
  return Number.isInteger(companyId) ? companyId : null;
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  console.error("meeting-notes:", error);
  const message = error instanceof Error ? error.message : "議事録の取り込みに失敗しました";
  return Response.json({ ok: false, error: message }, { status: 500 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const companyId = parseCompanyId((await ctx.params).id);
    if (companyId === null) return Response.json({ ok: false, error: "companyId が不正です" }, { status: 400 });
    return Response.json({ ok: true, notes: await listNotes(companyId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const companyId = parseCompanyId((await ctx.params).id);
    if (companyId === null) return Response.json({ ok: false, error: "companyId が不正です" }, { status: 400 });
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    if (!company) return Response.json({ ok: false, error: "企業が見つかりません" }, { status: 404 });

    const key = companySearchKey(company.name);
    if (!key) {
      return Response.json(
        { ok: false, error: `企業名「${company.name}」が短すぎるため、議事録を探せません` },
        { status: 400 },
      );
    }

    const rows = (await readMeetingSheet()).filter((r) => titleMatchesCompany(r.title, key));
    // 同じ行が2回書かれていても1件にする
    const unique = [...new Map(rows.map((r) => [r.sourceKey, r])).values()];

    const existing = new Set(
      (
        await prisma.meetingNote.findMany({
          where: { companyId, sourceKey: { in: unique.map((r) => r.sourceKey) } },
          select: { sourceKey: true },
        })
      ).map((n) => n.sourceKey),
    );
    const fresh = unique.filter((r) => !existing.has(r.sourceKey));
    if (fresh.length > 0) {
      await prisma.meetingNote.createMany({
        data: fresh.map((r) => ({
          companyId,
          sourceKey: r.sourceKey,
          title: r.title,
          meetingAt: r.meetingAt,
          meetingAtText: r.dateText || null,
          summary: r.summary || null,
          transcript: r.transcript || null,
          url: r.url || null,
        })),
        skipDuplicates: true,
      });
    }

    return Response.json({
      ok: true,
      found: unique.length,
      added: fresh.length,
      searchedFor: company.name,
      notes: await listNotes(companyId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
