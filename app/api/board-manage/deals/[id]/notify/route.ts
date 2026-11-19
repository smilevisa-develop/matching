/**
 * 案件ボードの管理: 公開した案件を、条件が合う登録済みパートナーにお知らせする準備 (要ログイン)。
 *
 * POST → 連絡グループ「案件ボード #{id} …」を作り直し (分野が合う登録済みパートナー)、
 *        一斉連絡の画面を開く URL を返す。送るのは社員が一斉連絡の画面で確かめてから。
 *        本文の {{案件ボードURL}} は、送るときにパートナーごとの専用リンクになる。
 *
 * 全員に一斉に送るのではなく、分野が合う相手だけに送る (返信と質問の殺到を防ぐ)。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { fieldMatches, totalLimitOf } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const dealId = Number(id);
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        field: true,
        requiredCount: true,
        deadline: true,
        boardStatus: true,
        boardTitle: true,
        boardArea: true,
        boardPartnerFee: true,
        boardPerPartnerLimit: true,
        boardTotalLimit: true,
        jobPostings: { orderBy: { updatedAt: "desc" }, take: 1, select: { monthlyGross: true } },
      },
    });
    if (!deal) return Response.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });
    if (deal.boardStatus !== "open") {
      return Response.json({ ok: false, error: "公開中の案件だけお知らせできます" }, { status: 400 });
    }

    const partners = await prisma.partner.findMany({
      where: { boardEnabled: true, boardToken: { not: null }, isActive: true },
      select: { id: true, introducibleFields: true },
    });
    // 分野を登録していないパートナーは「合うか分からない」ので入れない (送りすぎない側に倒す)
    const matched = deal.field ? partners.filter((p) => fieldMatches(p.introducibleFields, deal.field)) : partners;
    if (matched.length === 0) {
      return Response.json(
        { ok: false, error: "分野が合う登録済みのパートナーがいません。パートナーの「紹介できる分野」と登録を確かめてください。" },
        { status: 400 },
      );
    }

    const title = deal.boardTitle ?? `案件 ${deal.id}`;
    const groupName = `案件ボード #${deal.id} ${title}`.slice(0, 100);
    const existing = await prisma.group.findFirst({ where: { name: { startsWith: `案件ボード #${deal.id} ` } }, select: { id: true } });
    const group = existing
      ? await prisma.group.update({
          where: { id: existing.id },
          data: { name: groupName, members: { deleteMany: {}, create: matched.map((p) => ({ partnerId: p.id })) } },
          select: { id: true },
        })
      : await prisma.group.create({
          data: { name: groupName, members: { create: matched.map((p) => ({ partnerId: p.id })) } },
          select: { id: true },
        });

    const lines = [
      "スマイルリンクの案件ボードに、新しい案件を公開しました。",
      "",
      `■ ${title}`,
      [deal.field && `分野: ${deal.field}`, deal.boardArea && `勤務地: ${deal.boardArea}`, deal.jobPostings[0]?.monthlyGross && `月給: ${deal.jobPostings[0].monthlyGross}`]
        .filter(Boolean)
        .join(" / "),
      deal.boardPartnerFee ? `紹介料: ${deal.boardPartnerFee}` : "",
      deal.deadline ? `締切: ${deal.deadline.getFullYear()}/${deal.deadline.getMonth() + 1}/${deal.deadline.getDate()}` : "",
      "",
      "条件の詳細・推薦・ご質問は、貴社専用のリンクからお願いいたします。",
      "{{案件ボードURL}}",
      "",
      `※ 推薦は1社${deal.boardPerPartnerLimit}名まで、全体で${totalLimitOf(deal)}名に達した時点で締め切ります。`,
      "※ ご質問への回答は案件ページに載せますので、まずはそちらをご確認ください。",
    ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""));

    const url = `/broadcast?group=${group.id}&notice=${encodeURIComponent(lines.join("\n"))}`;
    return Response.json({ ok: true, groupId: group.id, count: matched.length, url });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
