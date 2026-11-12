/**
 * 請求の保存 (請求管理ページから)。
 *
 * PATCH /api/billing/{personId}
 *   { step: "invoice" | "payment" | "partnerInvoice" | "partnerPayment", done: boolean }
 *     段階を済 / 取り消しにする。内定者カードの請求タスクも合わせて済 / 未にする
 *   { fields: { unitPrice, invoiceAmount, route, partnerName, partnerCost, invoiceDate, dueDate, invoiceUrl, partnerInvoiceUrl, partnerPaidDate, note, joinDate } }
 *     金額・リンクなどを直す
 * どちらも、保存したあと企業データベースの請求管理へ書く (応答は待たせない)
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { billingPatchForStep, writeBillingToSheet, type LedgerStepKey } from "@/lib/billing-ledger";
import { todayJst } from "@/lib/deal-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEP_TASKS: Record<LedgerStepKey, string[]> = {
  invoice: ["invoice"],
  payment: ["payment"],
  partnerInvoice: ["pa-request", "pa-invoice"],
  partnerPayment: ["pa-payment"],
};

const YEN_FIELDS = ["unitPrice", "invoiceAmount", "partnerCost"] as const;
const DATE_FIELDS = ["invoiceDate", "dueDate", "partnerPaidDate", "joinDate"] as const;
const TEXT_FIELDS = ["route", "partnerName", "invoiceUrl", "partnerInvoiceUrl", "note"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    const account = await requireApiAccount();
    const personId = Number((await params).personId);
    if (!Number.isInteger(personId) || personId <= 0) return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, placement: { select: { id: true } } } });
    if (!person) return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const current = await prisma.personBilling.findUnique({ where: { personId } });
    const today = todayJst();
    let data: Record<string, unknown> = {};

    if (typeof body?.step === "string" && body.step in STEP_TASKS) {
      const step = body.step as LedgerStepKey;
      const done = body.done === true;
      data = billingPatchForStep(step, done, today, current);
      if (person.placement) {
        await prisma.placementTask.updateMany({
          where: { placementId: person.placement.id, billingStep: { in: STEP_TASKS[step] }, ...(done ? { doneAt: null } : {}) },
          data: done ? { doneAt: new Date(), doneBy: account.name ?? null } : { doneAt: null, doneBy: null },
        });
      }
    } else if (typeof body?.transferRequested === "boolean") {
      // 川村さんにパートナーへの振込を依頼した (振込の依頼 → 振込確認)
      data = { partnerTransferRequestedAt: body.transferRequested ? today : null };
    } else if (body?.fields && typeof body.fields === "object") {
      const f = body.fields as Record<string, unknown>;
      for (const k of YEN_FIELDS) {
        if (!(k in f)) continue;
        const n = f[k] === "" || f[k] == null ? null : Math.round(Number(String(f[k]).replace(/[^0-9.-]/g, "")));
        if (n !== null && !Number.isFinite(n)) return Response.json({ ok: false, error: `${k} は数字で入れてください` }, { status: 400 });
        data[k] = n;
      }
      for (const k of DATE_FIELDS) {
        if (!(k in f)) continue;
        const v = String(f[k] ?? "").trim();
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return Response.json({ ok: false, error: `${k} は日付で入れてください` }, { status: 400 });
        data[k] = v || null;
      }
      for (const k of TEXT_FIELDS) {
        if (!(k in f)) continue;
        const v = String(f[k] ?? "").trim();
        data[k] = v || null;
      }
    } else {
      return Response.json({ ok: false, error: "保存する内容がありません" }, { status: 400 });
    }

    const billing = await prisma.personBilling.upsert({
      where: { personId },
      create: { personId, ...data, updatedBy: account.name ?? null },
      update: { ...data, updatedBy: account.name ?? null },
    });
    after(async () => {
      const r = await writeBillingToSheet([personId]);
      if (r.error) console.warn("請求管理への反映に失敗:", r.error);
    });
    return Response.json({ ok: true, billing });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
