/**
 * 企業の「事前確認資料」の登録・取得 (要ログイン)。
 *
 * GET  /api/companies/[id]/documents        登録済みの資料一覧
 * POST /api/companies/[id]/documents        本文を貼り付けて登録 (AI がセクション分割)
 *        body: { title: string, sourceText: string, documentId?: number }
 *        documentId を渡すと既存資料の差し替え (翻訳キャッシュは作り直す)
 *
 * 翻訳は候補者へ送るときに言語ごとに 1 度だけ行い、資料に保存して使い回す。
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { parseSections, splitDocumentIntoSections } from "@/lib/company-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const companyId = Number(id);
    if (!Number.isFinite(companyId)) {
      return Response.json({ ok: false, error: "companyId が不正です" }, { status: 400 });
    }
    const documents = await prisma.companyDocument.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        sections: true,
        translations: true,
        updatedAt: true,
        _count: { select: { deliveries: true } },
      },
    });
    return Response.json({
      ok: true,
      documents: documents.map((d) => {
        const sections = parseSections(d.sections);
        const tr = (d.translations ?? {}) as Record<string, unknown>;
        return {
          id: d.id,
          title: d.title,
          sectionCount: sections.length,
          checkCount: sections.filter((s) => s.kind === "check").length,
          // 翻訳済みの言語コード (送信時に再翻訳が要るかの目安)
          translatedLanguages: Object.keys(tr),
          deliveryCount: d._count.deliveries,
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const companyId = Number(id);
    if (!Number.isFinite(companyId)) {
      return Response.json({ ok: false, error: "companyId が不正です" }, { status: 400 });
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return Response.json({ ok: false, error: "企業が見つかりません" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim() || "事前確認資料";
    const sourceText = String(body?.sourceText ?? "").trim();
    if (sourceText.length < 50) {
      return Response.json(
        { ok: false, error: "資料の本文を貼り付けてください（50 文字以上）" },
        { status: 400 },
      );
    }

    // AI でセクションに分割 (本文が大きく欠けたら warning が返る)
    const { sections, warning } = await splitDocumentIntoSections(sourceText);

    const documentId = Number(body?.documentId);
    const saved =
      Number.isFinite(documentId) && documentId > 0
        ? await prisma.companyDocument.update({
            where: { id: documentId },
            // 内容が変わったので翻訳キャッシュは破棄する (DbNull = SQL NULL に戻す)
            data: { title, sourceText, sections, translations: Prisma.DbNull },
          })
        : await prisma.companyDocument.create({
            data: { companyId, title, sourceText, sections },
          });

    return Response.json({
      ok: true,
      warning,
      document: {
        id: saved.id,
        title: saved.title,
        sections,
        sectionCount: sections.length,
        checkCount: sections.filter((s) => s.kind === "check").length,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
