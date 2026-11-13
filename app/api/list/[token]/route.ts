/**
 * 企業が共有の推薦リスト (/list/{token}) で書いたものを保存する。ログイン不要 (token が鍵)。
 *   PATCH { candidateId, stage? , interviewTime?, companyNote? }
 * 進捗はカンバンで動かしたのと同じ扱い (人数・内定者管理・企業データベース・KPI まで反映。lib/deal-candidate-stage)。
 * 面接時間・メモは DealCandidate に入れ、アプリのカンバンのカードに出す。
 */

import { prisma } from "@/lib/prisma";
import { todayJst } from "@/lib/deal-stages";
import { changeCandidateStage } from "@/lib/deal-candidate-stage";
import { companyStageOptions, SHARE_TEXT_MAX } from "@/lib/share-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (v: unknown) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, SHARE_TEXT_MAX) || null);

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return Response.json({ ok: false, error: "URL が正しくありません" }, { status: 404 });
    const deal = await prisma.deal.findUnique({ where: { shareToken: token }, select: { id: true, company: { select: { companyKind: true } } } });
    if (!deal) return Response.json({ ok: false, error: "このリストは共有が止められています" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const candidateId = Number(body.candidateId);
    const link = await prisma.dealCandidate.findFirst({ where: { id: candidateId, dealId: deal.id }, select: { id: true, stage: true } });
    if (!link) return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });

    const interviewTime = text(body.interviewTime);
    const companyNote = text(body.companyNote);
    if (interviewTime !== undefined || companyNote !== undefined) {
      await prisma.dealCandidate.update({
        where: { id: link.id },
        data: { ...(interviewTime !== undefined ? { interviewTime } : {}), ...(companyNote !== undefined ? { companyNote } : {}), companyEditedAt: new Date() },
      });
    }
    if (body.stage !== undefined) {
      const stage = String(body.stage);
      if (!companyStageOptions(deal.company.companyKind).includes(stage)) return Response.json({ ok: false, error: "選べない進捗です" }, { status: 400 });
      if (stage !== link.stage) {
        await changeCandidateStage(link.id, stage, todayJst());
        await prisma.dealCandidate.update({ where: { id: link.id }, data: { companyEditedAt: new Date() } });
      }
    }
    const saved = await prisma.dealCandidate.findUnique({ where: { id: link.id }, select: { stage: true, interviewTime: true, companyNote: true } });
    return Response.json({ ok: true, candidate: saved });
  } catch (error) {
    console.warn("共有の推薦リストの保存に失敗:", error);
    return Response.json({ ok: false, error: "保存できませんでした" }, { status: 500 });
  }
}
