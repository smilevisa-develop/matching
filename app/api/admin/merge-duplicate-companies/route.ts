/**
 * 企業IDが未設定の重複企業を、同名で企業IDを持つ企業へ統合する (要ログイン)。
 *
 * GET /api/admin/merge-duplicate-companies          ← ドライラン (統合案を返すだけ)
 * GET /api/admin/merge-duplicate-companies?apply=1  ← 実行
 *
 * 背景:
 *   企業マスタ(スプシ)には企業IDがあるのに、系で同じ会社がもう 1 件
 *   企業ID無しで作られていた (「株式会社慈光」が 2 レコードある等)。
 *   企業IDが無い側にぶら下がった案件は、スプシへ同期できない。
 *
 * 統合の内容:
 *   ID無し企業に紐づく 案件 / チェックリスト配信 / 事前確認資料 を
 *   ID有り企業へ付け替え、ID無し企業を削除する。
 *   ※ 企業ID の重複は作らない (ID無し側に ID を付けるのではなく、寄せて消す)
 *
 * 名寄せは「記号と空白を除いた企業名の完全一致」だけを見る。
 * 部分一致で別会社を巻き込むと取り返しがつかないため、曖昧な候補は統合しない。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** 企業名の表記ゆれを吸収する (「社会福祉法人-馬橋福祉会」と「社会福祉法人馬橋福祉会」を同一視) */
function normalizeName(name: string): string {
  return name
    .replace(/[-－‐–—・\s　]/g, "")
    .replace(/[（(].*?[)）]/g, "")
    .trim()
    .toLowerCase();
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const apply = new URL(req.url).searchParams.get("apply") === "1";

    const companies = await prisma.company.findMany({
      select: { id: true, externalId: true, name: true },
      orderBy: { id: "asc" },
    });

    // 正規化名 → ID有り企業 (統合先)
    const targetByName = new Map<string, { id: number; externalId: string; name: string }>();
    for (const c of companies) {
      if (!c.externalId) continue;
      const key = normalizeName(c.name);
      if (!targetByName.has(key)) {
        targetByName.set(key, { id: c.id, externalId: c.externalId, name: c.name });
      }
    }

    const merges: {
      fromId: number;
      fromName: string;
      toId: number;
      toName: string;
      externalId: string;
      deals: number;
      checklists: number;
      documents: number;
    }[] = [];
    const unmatched: { id: number; name: string; reason: string }[] = [];

    for (const c of companies) {
      if (c.externalId) continue;
      const target = targetByName.get(normalizeName(c.name));
      if (!target) {
        unmatched.push({
          id: c.id,
          name: c.name,
          reason: "同名で企業IDを持つ企業が見つかりません (企業マスタに追加が必要)",
        });
        continue;
      }
      const [deals, checklists, documents] = await Promise.all([
        prisma.deal.count({ where: { companyId: c.id } }),
        prisma.jobChecklistDelivery.count({ where: { companyId: c.id } }),
        prisma.companyDocument.count({ where: { companyId: c.id } }),
      ]);
      merges.push({
        fromId: c.id,
        fromName: c.name,
        toId: target.id,
        toName: target.name,
        externalId: target.externalId,
        deals,
        checklists,
        documents,
      });
    }

    if (apply) {
      for (const m of merges) {
        // 参照を付け替えてから、空になった重複レコードを消す
        await prisma.$transaction([
          prisma.deal.updateMany({
            where: { companyId: m.fromId },
            data: { companyId: m.toId },
          }),
          prisma.jobChecklistDelivery.updateMany({
            where: { companyId: m.fromId },
            data: { companyId: m.toId },
          }),
          prisma.companyDocument.updateMany({
            where: { companyId: m.fromId },
            data: { companyId: m.toId },
          }),
          prisma.company.delete({ where: { id: m.fromId } }),
        ]);
      }
    }

    return Response.json({
      ok: true,
      apply,
      mergeCount: merges.length,
      merges,
      unmatched,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
