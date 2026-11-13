/**
 * 請求書 PDF のアップロード (請求管理ページから)。
 *
 * POST /api/billing/{personId}/upload  { kind: "invoice" | "partnerInvoice", fileName, dataUrl }
 *   Drive の請求書フォルダ / {請求した月 (入社の翌月)} / 売上 (企業への請求書) or 支払い (パートナーの請求書) に保存し、
 *   リンクを請求に入れて、その段階を「済」にする (アップロード = 完了。2026/11 土田さん)。
 *   企業データベースの請求管理にも書く。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { INVOICE_ROOT_FOLDER_URL, billingPatchForStep, writeBillingToSheet } from "@/lib/billing-ledger";
import { ensureSubFolder, uploadDataUrlToDrive } from "@/lib/google-docs";
import { todayJst } from "@/lib/deal-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = {
  invoice: { folder: "売上", suffix: "請求書", urlField: "invoiceUrl", tasks: ["invoice"] },
  partnerInvoice: { folder: "支払い", suffix: "パートナー請求書", urlField: "partnerInvoiceUrl", tasks: ["pa-request", "pa-invoice"] },
} as const;

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
    const k = KINDS[kind];

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, onboarding: { select: { englishName: true } }, placement: { select: { id: true, joinAt: true } }, billing: true },
    });
    if (!person) return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });

    // 請求した月 = 入社の翌月 (入社日が無ければ今月)
    const join = person.placement?.joinAt
      ? new Date(person.placement.joinAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
      : person.billing?.joinDate ?? null;
    let y: number;
    let m: number;
    if (join && /^\d{4}-\d{2}/.test(join)) {
      y = Number(join.slice(0, 4));
      m = Number(join.slice(5, 7)) + 1;
      if (m > 12) {
        m = 1;
        y++;
      }
    } else {
      const t = todayJst();
      y = Number(t.slice(0, 4));
      m = Number(t.slice(5, 7));
    }

    const monthFolder = await ensureSubFolder({ parentFolderUrl: INVOICE_ROOT_FOLDER_URL, folderName: `${y}年${m}月` });
    const kindFolder = await ensureSubFolder({ parentFolderUrl: monthFolder.folderUrl, folderName: k.folder });
    const name = (person.onboarding?.englishName?.trim() || person.name).replace(/[\\/:*?"<>|]/g, "");
    const uploaded = await uploadDataUrlToDrive({
      dataUrl: body.dataUrl,
      fileName: `${String(person.id).padStart(4, "0")}_${name}_${k.suffix}.pdf`,
      folderUrl: kindFolder.folderUrl,
    });

    // リンクを入れて、その段階を済にする
    const step = kind === "invoice" ? "invoice" : "partnerInvoice";
    const data = { ...billingPatchForStep(step, true, todayJst(), person.billing), [k.urlField]: uploaded.fileUrl };
    const billing = await prisma.personBilling.upsert({
      where: { personId },
      create: { personId, ...data, updatedBy: account.name ?? null },
      update: { ...data, updatedBy: account.name ?? null },
    });
    if (person.placement) {
      await prisma.placementTask.updateMany({
        where: { placementId: person.placement.id, billingStep: { in: [...k.tasks] }, doneAt: null },
        data: { doneAt: new Date(), doneBy: account.name ?? null },
      });
    }
    after(async () => {
      const r = await writeBillingToSheet([personId]);
      if (r.error) console.warn("請求管理への反映に失敗:", r.error);
    });
    return Response.json({ ok: true, url: uploaded.fileUrl, billing });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    const hint = /not found|404/i.test(msg) ? " (請求書の Drive フォルダがアプリと共有されていない可能性があります)" : "";
    return Response.json({ ok: false, error: msg + hint }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
