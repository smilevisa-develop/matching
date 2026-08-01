/**
 * 母国語 求人票チェックリストの作成・送信 (要ログイン)。
 *
 * POST /api/personnel/[id]/checklist
 *   body: { language?: "vi"|"id"|"my"|"ne" }
 *
 * 処理:
 *   1. 候補者の推薦先企業を特定 (recommendedCompany の "企業ID_企業名" から企業IDを取り出す)
 *   2. その企業の求人(Deal.conditions)から要点を作る (足りなければ 400)
 *   3. 母国語に翻訳 (キーローテーションで無料枠運用)
 *   4. JobChecklistDelivery を作成しトークン付き公開URLを返す
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildJapaneseKeyPoints,
  hasEnoughJobInfo,
  nationalityToLanguage,
  translateChecklist,
  type ChecklistLanguage,
} from "@/lib/job-checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_LANGS: ChecklistLanguage[] = ["vi", "id", "my", "ne"];

/** "14sv_株式会社シナジー" → "14sv" (企業ID部分) */
function parseCompanyExternalId(recommendedCompany: string | null | undefined): string | null {
  const s = (recommendedCompany ?? "").trim();
  if (!s) return null;
  const idx = s.search(/[_＿]/);
  const idPart = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
  return /^[a-z0-9]{2,}$/.test(idPart) ? idPart : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "無効なIDです" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, nationality: true, recommendedCompany: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    // 1. 推薦先企業を特定
    const externalId = parseCompanyExternalId(person.recommendedCompany);
    if (!externalId) {
      return Response.json(
        { ok: false, error: "推薦先企業が設定されていません。先に推薦先企業を選択してください。" },
        { status: 400 },
      );
    }
    const company = await prisma.company.findFirst({
      where: { externalId },
      select: { id: true, name: true, deals: { select: { conditions: true, updatedAt: true } } },
    });
    if (!company) {
      return Response.json(
        { ok: false, error: `推薦先企業 (${externalId}) が企業マスタに見つかりません` },
        { status: 400 },
      );
    }

    // 2. 求人(conditions)から要点。複数案件があれば条件が入っている最新を採用
    const dealWithConditions = company.deals
      .filter((d) => d.conditions)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const keyPoints = buildJapaneseKeyPoints(dealWithConditions?.conditions);
    if (!hasEnoughJobInfo(dealWithConditions?.conditions)) {
      return Response.json(
        {
          ok: false,
          error: `「${company.name}」の求人情報が不足しています。企業の求人で条件(仕事内容・給料など)を入力してください。`,
        },
        { status: 400 },
      );
    }

    // 3. 言語決定 (指定 > 国籍から推定) → 翻訳
    const body = await req.json().catch(() => ({}));
    const reqLang = typeof body?.language === "string" ? (body.language as ChecklistLanguage) : null;
    const language: ChecklistLanguage =
      reqLang && VALID_LANGS.includes(reqLang) ? reqLang : nationalityToLanguage(person.nationality);
    const items = await translateChecklist(keyPoints, language);

    // 4. 配信レコード作成
    const token = randomBytes(24).toString("base64url");
    const delivery = await prisma.jobChecklistDelivery.create({
      data: {
        personId: person.id,
        companyId: company.id,
        language,
        token,
        items: items as unknown as object,
        sentAt: new Date(),
      },
    });

    return Response.json({
      ok: true,
      token,
      language,
      path: `/checklist/${token}`,
      deliveryId: delivery.id,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
