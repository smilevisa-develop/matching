/**
 * 請求書 PDF を Drive に保存して、その人の請求に入れる (請求管理ページのアップロードと Slack の両方から使う)。
 *
 * 保存先 (Drive にもとからある形に合わせる 2026/11):
 *   企業への請求書     … 請求書フォルダ / 01_売上 / {請求した月 (入社の翌月)}月
 *   パートナーの請求書 … 請求書フォルダ / 02_支払い / {振り込む月 (入社の翌々月)}月
 * 上げた = 完了 (2026/11 土田さん) なので、その段階を済にして内定者カードのタスクも済にし、企業データベースの請求管理にも書く。
 * 1 枚の請求書に何人か載っているとき (同じ企業の何人か) は、全員に同じリンクを入れる。
 */

import { prisma } from "@/lib/prisma";
import { INVOICE_ROOT_FOLDER_URL, billingPatchForStep, writeBillingToSheet } from "@/lib/billing-ledger";
import { ensureSubFolder, uploadDataUrlToDrive } from "@/lib/google-docs";
import { todayJst } from "@/lib/deal-stages";

export type InvoiceKind = "invoice" | "partnerInvoice";

const KINDS = {
  invoice: { folder: "01_売上", monthsAfterJoin: 1, suffix: "請求書", urlField: "invoiceUrl", tasks: ["invoice"] },
  partnerInvoice: { folder: "02_支払い", monthsAfterJoin: 2, suffix: "パートナー請求書", urlField: "partnerInvoiceUrl", tasks: ["pa-request", "pa-invoice"] },
} as const;

const ymdJst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** 入社の n か月後の「11月」(入社日が無ければ今月) */
export function invoiceMonthFolderName(join: string | null, monthsAfterJoin: number) {
  if (join && /^\d{4}-\d{2}/.test(join)) return `${((Number(join.slice(5, 7)) - 1 + monthsAfterJoin) % 12) + 1}月`;
  return `${Number(todayJst().slice(5, 7))}月`;
}

export async function saveInvoicePdf({
  personIds,
  kind,
  dataUrl,
  fileName,
  by,
}: {
  personIds: number[];
  kind: InvoiceKind;
  dataUrl: string;
  /** 無ければ「0012_NAME_請求書.pdf」 */
  fileName?: string;
  by: string | null;
}): Promise<{ url: string }> {
  const k = KINDS[kind];
  const people = await prisma.person.findMany({
    where: { id: { in: personIds } },
    select: { id: true, name: true, onboarding: { select: { englishName: true } }, placement: { select: { id: true, joinAt: true } }, billing: true },
  });
  if (people.length === 0) throw new Error("候補者が見つかりません");
  const first = people[0];
  const join = first.placement?.joinAt ? ymdJst(first.placement.joinAt) : (first.billing?.joinDate ?? null);

  const kindRoot = await ensureSubFolder({ parentFolderUrl: INVOICE_ROOT_FOLDER_URL, folderName: k.folder });
  const kindFolder = await ensureSubFolder({ parentFolderUrl: kindRoot.folderUrl, folderName: invoiceMonthFolderName(join, k.monthsAfterJoin) });
  const name = (first.onboarding?.englishName?.trim() || first.name).replace(/[\\/:*?"<>|]/g, "");
  const uploaded = await uploadDataUrlToDrive({
    dataUrl,
    fileName: fileName?.trim() || `${String(first.id).padStart(4, "0")}_${name}_${k.suffix}.pdf`,
    folderUrl: kindFolder.folderUrl,
  });

  const step = kind === "invoice" ? "invoice" : "partnerInvoice";
  for (const p of people) {
    const data = { ...billingPatchForStep(step, true, todayJst(), p.billing), [k.urlField]: uploaded.fileUrl };
    await prisma.personBilling.upsert({
      where: { personId: p.id },
      create: { personId: p.id, ...data, updatedBy: by },
      update: { ...data, updatedBy: by },
    });
    if (p.placement) {
      await prisma.placementTask.updateMany({
        where: { placementId: p.placement.id, billingStep: { in: [...k.tasks] }, doneAt: null },
        data: { doneAt: new Date(), doneBy: by },
      });
    }
  }
  const r = await writeBillingToSheet(people.map((p) => p.id));
  if (r.error) console.warn("請求管理への反映に失敗:", r.error);
  return { url: uploaded.fileUrl };
}
