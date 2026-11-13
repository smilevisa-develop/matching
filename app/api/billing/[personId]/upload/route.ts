/**
 * 請求書 PDF のアップロード (請求管理ページから)。
 *
 * POST /api/billing/{personId}/upload  { kind: "invoice" | "partnerInvoice", fileName, dataUrl }
 *   Drive の請求書フォルダに保存し、リンクを請求に入れて、その段階を「済」にする (lib/billing-invoice)
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { saveInvoicePdf } from "@/lib/billing-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    const account = await requireApiAccount();
    const personId = Number((await params).personId);
    if (!Number.isInteger(personId) || personId <= 0) return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    let body: { kind?: string; fileName?: string; dataUrl?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: "ファイルが大きすぎて受け取れませんでした" }, { status: 413 });
    }
    const kind = body.kind === "invoice" || body.kind === "partnerInvoice" ? body.kind : null;
    if (!kind) return Response.json({ ok: false, error: "kind が不正です" }, { status: 400 });
    if (typeof body.dataUrl !== "string" || !body.dataUrl.startsWith("data:application/pdf;base64,")) {
      return Response.json({ ok: false, error: "PDF を選んでください" }, { status: 400 });
    }
    if (!(await prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }
    const { url } = await saveInvoicePdf({ personIds: [personId], kind, dataUrl: body.dataUrl, by: account.name ?? null });
    const billing = await prisma.personBilling.findUnique({ where: { personId } });
    return Response.json({ ok: true, url, billing });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    const hint = /not found|404/i.test(msg) ? " (請求書の Drive フォルダがアプリと共有されていない可能性があります)" : "";
    return Response.json({ ok: false, error: msg + hint }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
