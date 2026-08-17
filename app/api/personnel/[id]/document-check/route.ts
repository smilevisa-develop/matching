/**
 * 事前確認資料を候補者へ送る (要ログイン)。
 *
 * GET  /api/personnel/[id]/document-check
 *        送れる資料の一覧 + これまでの配信状況を返す
 * POST /api/personnel/[id]/document-check
 *        body: { documentId: number, language?: "vi"|"id"|"my"|"ne" }
 *        資料を母国語に訳して配信リンクを発行する
 *
 * 翻訳は資料 (CompanyDocument.translations) に言語ごとに保存し、
 * 2 人目以降は訳し直さない (無料枠の節約と、発行を一瞬で終わらせるため)。
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  nationalityToLanguage,
  parseDeliveryItems,
  parseSections,
  translateDocumentSections,
  type ChecklistLanguage,
  type DocumentDeliveryItem,
} from "@/lib/company-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const VALID_LANGS: ChecklistLanguage[] = ["vi", "id", "my", "ne"];

/** "14sv_株式会社シナジー" → "14sv" (企業ID部分) */
function parseCompanyExternalId(recommendedCompany: string | null | undefined): string | null {
  const s = (recommendedCompany ?? "").trim();
  if (!s) return null;
  const idx = s.search(/[_＿]/);
  const idPart = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
  return /^[a-z0-9]{2,}$/.test(idPart) ? idPart : null;
}

/**
 * 候補者に紐づく企業を特定する。
 * 推薦先企業の手動設定 → 案件由来 の順に見る (求人票チェックリストと同じ考え方)。
 */
async function resolveCompanyId(personId: number): Promise<number | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      recommendedCompany: true,
      dealCandidates: {
        select: { deal: { select: { companyId: true } } },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
  });
  if (!person) return null;

  const externalId = parseCompanyExternalId(person.recommendedCompany);
  if (externalId) {
    const company = await prisma.company.findUnique({
      where: { externalId },
      select: { id: true },
    });
    if (company) return company.id;
  }
  return person.dealCandidates[0]?.deal.companyId ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }

    const companyId = await resolveCompanyId(personId);
    const documents = companyId
      ? await prisma.companyDocument.findMany({
          where: { companyId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, sections: true },
        })
      : [];

    const deliveries = await prisma.companyDocumentDelivery.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        language: true,
        items: true,
        sentAt: true,
        openedAt: true,
        checkedItems: true,
        unclearItems: true,
        completedAt: true,
        document: { select: { id: true, title: true } },
      },
    });

    return Response.json({
      ok: true,
      companyId,
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        sectionCount: parseSections(d.sections).length,
      })),
      deliveries: deliveries.map((d) => {
        const items = parseDeliveryItems(d.items);
        const checked = (d.checkedItems ?? {}) as Record<string, unknown>;
        const unclear = (d.unclearItems ?? {}) as Record<string, unknown>;
        const checkTargets = items.filter((i) => i.kind === "check");
        return {
          id: d.id,
          token: d.token,
          language: d.language,
          documentTitle: d.document.title,
          totalCheckItems: checkTargets.length,
          checkedCount: checkTargets.filter((i) => checked[i.key] === true).length,
          // 面談で説明すべき箇所 (候補者が「わからない」を付けたセクション)
          unclearSections: items
            .filter((i) => unclear[i.key] === true)
            .map((i) => ({ key: i.key, title: i.title })),
          sentAt: d.sentAt?.toISOString() ?? null,
          openedAt: d.openedAt?.toISOString() ?? null,
          completedAt: d.completedAt?.toISOString() ?? null,
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
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, nationality: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = Number(body?.documentId);
    if (!Number.isFinite(documentId)) {
      return Response.json({ ok: false, error: "資料を選択してください" }, { status: 400 });
    }
    const requested = String(body?.language ?? "");
    const language: ChecklistLanguage = VALID_LANGS.includes(requested as ChecklistLanguage)
      ? (requested as ChecklistLanguage)
      : nationalityToLanguage(person.nationality);

    const document = await prisma.companyDocument.findUnique({
      where: { id: documentId },
      select: { id: true, sections: true, translations: true },
    });
    if (!document) {
      return Response.json({ ok: false, error: "資料が見つかりません" }, { status: 404 });
    }
    const sections = parseSections(document.sections);
    if (sections.length === 0) {
      return Response.json({ ok: false, error: "資料にセクションがありません" }, { status: 400 });
    }

    // 翻訳キャッシュがあれば使い回し、無ければ訳して資料に保存する
    const cache = (document.translations ?? {}) as Record<string, unknown>;
    let items: DocumentDeliveryItem[] = parseDeliveryItems(cache[language]);
    // セクション構成が変わっている場合は訳し直す
    const cacheUsable =
      items.length === sections.length && sections.every((s) => items.some((i) => i.key === s.key));
    if (!cacheUsable) {
      items = await translateDocumentSections(sections, language);
      await prisma.companyDocument.update({
        where: { id: document.id },
        data: {
          translations: { ...cache, [language]: items } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const token = randomBytes(24).toString("base64url");
    const delivery = await prisma.companyDocumentDelivery.create({
      data: {
        personId,
        documentId: document.id,
        language,
        token,
        items,
        sentAt: new Date(),
      },
      select: { id: true, token: true },
    });

    return Response.json({
      ok: true,
      delivery: { id: delivery.id, token: delivery.token, language },
      path: `/document-check/${delivery.token}`,
      translated: !cacheUsable,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
