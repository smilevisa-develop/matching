/**
 * 共有の推薦リストを、暗証番号を知っている人が直す (2026-11-18 土田さん)。
 *   { pass } だけ → 暗証番号の確認
 *   { pass, id, key, value } → その候補者のそのセルを保存
 * 面接可能な時間帯・備考はカンバンの ✎ と同じ欄に書く。ほかの列は listOverrides に入れて、このリストの表示だけ変える。
 * 編集できる状態はブラウザの画面の中だけ (ページを閉じれば終わり)。
 */

import { prisma } from "@/lib/prisma";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS = () => process.env.LIST_EDIT_PASSCODE?.trim() || "thuy";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { pass?: string; id?: number; key?: string; value?: string };
  if (!token || token.length < 16) return Response.json({ ok: false, error: "見つかりません" }, { status: 404 });
  if ((body.pass ?? "").trim().toLowerCase() !== PASS().toLowerCase()) {
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ ok: false, error: "暗証番号が違います" }, { status: 403 });
  }
  const deal = await prisma.deal.findUnique({ where: { shareToken: token }, select: { id: true } });
  if (!deal) return Response.json({ ok: false, error: "見つかりません" }, { status: 404 });
  if (body.id === undefined) return Response.json({ ok: true });

  const dc = await prisma.dealCandidate.findFirst({ where: { id: Number(body.id), dealId: deal.id }, select: { id: true, listOverrides: true } });
  if (!dc) return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
  const key = String(body.key ?? "");
  const value = String(body.value ?? "").trim().slice(0, 2000);

  if (key === "interviewTime" || key === "note") {
    await prisma.dealCandidate.update({
      where: { id: dc.id },
      data: key === "interviewTime" ? { interviewTime: value || null } : { companyNote: value || null },
    });
    return Response.json({ ok: true });
  }
  const settings = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { recommendationColumns: true } });
  if (!sanitizeRecommendationColumns(settings?.recommendationColumns).includes(key as never)) {
    return Response.json({ ok: false, error: "この列は直せません" }, { status: 400 });
  }
  const current = (dc.listOverrides && typeof dc.listOverrides === "object" ? dc.listOverrides : {}) as Record<string, string>;
  const next = { ...current };
  // null = 元の値に戻す
  if (body.value === null || body.value === undefined) delete next[key];
  else next[key] = value;
  await prisma.dealCandidate.update({ where: { id: dc.id }, data: { listOverrides: next } });
  return Response.json({ ok: true });
}
