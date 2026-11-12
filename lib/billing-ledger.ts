/**
 * 請求 (PersonBilling) と企業データベース「請求管理」タブのやり取り (2026/11 土田さん: 請求の管理をアプリで回す)。
 *
 * 請求管理タブ (スプシ) が最新 (2026/11/12 土田さん)。
 *   - 読み込み: 請求管理ページを開いたときと毎時の同期で、スプシの値をアプリに上書きする (refreshBillingFromSheet)
 *   - 書き込み: アプリで直した (保存した・丸を押した) ときだけ、その人の違うセルをスプシに書く (writeBillingToSheet)
 *   - 書かない列: 関数の列 (候補者名・企業・日付・状況・パートナーなど) と、リンクの列でアプリに URL が無いもの
 *     (スプシのリンクはファイルのチップで、文字だけ書くとリンクが消えるため)
 */

import { prisma } from "@/lib/prisma";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { getSheetsClient } from "@/lib/sheets-sync";
import type { PersonBilling } from "@/generated/prisma/client";

const TAB = "請求管理";
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export const INVOICE_STATUSES = ["未発行", "発行済"] as const;
export const PAYMENT_STATUSES = ["未入金", "入金済"] as const;
export const PARTNER_INVOICE_STATUSES = ["未受領", "受領済"] as const;
export const PARTNER_PAY_STATUSES = ["未払い", "支払済"] as const;
export const ROUTES = ["自社", "パートナー"] as const;

type Kind = "yen" | "date" | "text" | "url";
type BillingKey = Exclude<keyof PersonBilling, "id" | "personId" | "createdAt" | "updatedAt">;
type Field = { key: BillingKey; header: string; nth?: number; kind: Kind; write: boolean };

/** アプリの項目 ↔ 請求管理の見出し (同じ見出しが 2 つある「請求書リンク」は何番目か) */
export const BILLING_FIELDS: Field[] = [
  // 請求書ID は関数 (通し番号) なので読むだけ
  { key: "invoiceNo", header: "請求書ID", kind: "text", write: false },
  { key: "note", header: "備考", kind: "text", write: true },
  { key: "unitPrice", header: "単価", kind: "yen", write: true },
  { key: "invoiceDate", header: "請求日", kind: "date", write: true },
  { key: "invoiceAmount", header: "請求金額", kind: "yen", write: true },
  { key: "dueDate", header: "入金期日", kind: "date", write: true },
  { key: "invoiceStatus", header: "請求書", kind: "text", write: true },
  { key: "paymentStatus", header: "請求ステータス", kind: "text", write: true },
  { key: "invoiceUrl", header: "請求書リンク", nth: 0, kind: "url", write: true },
  { key: "route", header: "自社 or PA", kind: "text", write: true },
  // パートナーは関数 (候補者DB から引く) なので読むだけ
  { key: "partnerName", header: "パートナー", kind: "text", write: false },
  { key: "partnerCost", header: "仕入高", kind: "yen", write: true },
  { key: "partnerInvoiceStatus", header: "PAからの請求書", kind: "text", write: true },
  { key: "partnerPayStatus", header: "支払い有無", kind: "text", write: true },
  { key: "partnerPaidDate", header: "支払日", kind: "date", write: true },
  { key: "partnerInvoiceUrl", header: "請求書リンク", nth: 1, kind: "url", write: true },
  // 入社日は関数 (内定者管理から引く)。内定者管理に居ない人のために読むだけ
  { key: "joinDate", header: "入社日", kind: "date", write: false },
];

const num = (v: string) => {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return v.trim() && Number.isFinite(n) ? Math.round(n) : null;
};
const ymd = (v: string) => {
  const m = v.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};

/** スプシのセル → アプリの値 */
function fromCell(kind: Kind, v: string): string | number | null {
  const t = v.trim();
  if (!t) return null;
  if (kind === "yen") return num(t);
  if (kind === "date") return ymd(t);
  return t;
}

/** 比べるときの形 */
function comparable(kind: Kind, v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (kind === "yen") return s ? String(num(s) ?? "") : "";
  if (kind === "date") return ymd(s) ?? s;
  return s;
}

/** アプリの値 → スプシに書く文字 */
function toCell(kind: Kind, v: unknown): string {
  if (v == null || v === "") return "";
  if (kind === "yen") return `¥${Number(v).toLocaleString("ja-JP")}`;
  if (kind === "date") return String(v).replace(/-/g, "/");
  return String(v);
}

type Sheet = {
  header: string[];
  rows: string[][];
  colOf: (f: Field) => number;
  rowOf: Map<number, number>;
  /** リンクの列のセルにあるリンク先 (ファイルのチップ・リンクつきの文字)。キーは "行,列" (0 始まり) */
  links: Map<string, string>;
};

async function readSheet(): Promise<{ sheet: Sheet; spreadsheetId: string; sheets: Awaited<ReturnType<typeof getSheetsClient>> } | null> {
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return null;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(TAB)}!A1:AZ2005` });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  const header = (rows[0] ?? []).map((h) => h.trim());
  const colOf = (f: Field) => {
    let seen = -1;
    for (let i = 0; i < header.length; i++) {
      if (header[i] !== f.header) continue;
      seen++;
      if (seen === (f.nth ?? 0)) return i;
    }
    return -1;
  };
  const rowOf = new Map<number, number>();
  rows.forEach((r, i) => {
    const a = (r[0] ?? "").trim();
    if (i > 0 && /^\d+$/.test(a)) rowOf.set(Number(a), i);
  });
  // リンクの列は、表示の文字 (ファイル名や「URL」) ではなくリンク先を読む
  const links = new Map<string, string>();
  const linkCols = BILLING_FIELDS.filter((f) => f.kind === "url").map((f) => colOf(f)).filter((c) => c >= 0);
  if (linkCols.length > 0) {
    const grid = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: linkCols.map((c) => `${quote(TAB)}!${colLetter(c)}1:${colLetter(c)}2005`),
      fields: "sheets.data(startColumn,rowData.values(hyperlink,chipRuns.chip.richLinkProperties.uri,textFormatRuns.format.link.uri))",
    });
    for (const d of grid.data.sheets?.[0]?.data ?? []) {
      const col = d.startColumn ?? 0;
      (d.rowData ?? []).forEach((rd, i) => {
        const v = rd.values?.[0];
        const uri =
          v?.hyperlink ??
          v?.chipRuns?.find((r) => r.chip?.richLinkProperties?.uri)?.chip?.richLinkProperties?.uri ??
          v?.textFormatRuns?.find((r) => r.format?.link?.uri)?.format?.link?.uri ??
          null;
        if (uri) links.set(`${i},${col}`, uri);
      });
    }
  }
  return { sheet: { header, rows, colOf, rowOf, links }, spreadsheetId, sheets };
}

/** 請求管理の行 (A 列が候補者ID) の値でアプリの請求を上書きする (スプシが最新) */
export async function refreshBillingFromSheet(): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;
  const s = await readSheet();
  if (!s) return { updated, created };
  const ids = [...s.sheet.rowOf.keys()];
  const [persons, existing] = await Promise.all([
    prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.personBilling.findMany({ where: { personId: { in: ids } } }),
  ]);
  const known = new Set(persons.map((p) => p.id));
  const byPerson = new Map(existing.map((b) => [b.personId, b]));
  for (const id of ids) {
    if (!known.has(id)) continue;
    const row = s.sheet.rows[s.sheet.rowOf.get(id)!];
    const data: Record<string, unknown> = {};
    for (const f of BILLING_FIELDS) {
      const c = s.sheet.colOf(f);
      if (c < 0) continue;
      data[f.key] = f.kind === "url" ? (s.sheet.links.get(`${s.sheet.rowOf.get(id)},${c}`) ?? fromCell(f.kind, row[c] ?? "")) : fromCell(f.kind, row[c] ?? "");
    }
    const cur = byPerson.get(id);
    if (!cur) {
      await prisma.personBilling.create({ data: { personId: id, ...data, updatedBy: "請求管理シート" } });
      created++;
      continue;
    }
    // リンクは、スプシがチップ (文字だけ) でアプリに URL があるときはアプリの URL を残す
    for (const f of BILLING_FIELDS) {
      if (f.kind !== "url") continue;
      const appUrl = cur[f.key];
      if (typeof appUrl === "string" && /^https?:\/\//.test(appUrl) && !/^https?:\/\//.test(String(data[f.key] ?? ""))) data[f.key] = appUrl;
    }
    const changed = BILLING_FIELDS.some((f) => f.key in data && comparable(f.kind, cur[f.key]) !== comparable(f.kind, data[f.key]));
    if (!changed) continue;
    await prisma.personBilling.update({ where: { personId: id }, data: { ...data, updatedBy: "請求管理シート" } });
    updated++;
  }
  return { updated, created };
}

export type BillingSheetChange = { personId: number; cell: string; header: string; from: string; to: string };

/** アプリで直した人の請求を請求管理へ書く (違うセルだけ) */
export async function writeBillingToSheet(personIds: number[]): Promise<{ changes: BillingSheetChange[]; error: string | null }> {
  const changes: BillingSheetChange[] = [];
  try {
    const s = await readSheet();
    if (!s) return { changes, error: "企業データベースのスプシIDが未設定" };
    const list = await prisma.personBilling.findMany({ where: { personId: { in: personIds } } });
    const data: { range: string; values: string[][] }[] = [];
    for (const b of list) {
      const r = s.sheet.rowOf.get(b.personId);
      if (r == null) continue;
      for (const f of BILLING_FIELDS) {
        if (!f.write) continue;
        const c = s.sheet.colOf(f);
        if (c < 0) continue;
        const value = b[f.key];
        // リンクは、アプリで URL を入れたときだけ書く (チップを文字で消さない)
        if (f.kind === "url" && !(typeof value === "string" && /^https?:\/\//.test(value))) continue;
        // リンクの列は、セルのリンク先と比べる (ファイルのチップは表示がファイル名なので)
        const now = (f.kind === "url" ? s.sheet.links.get(`${r},${c}`) : undefined) ?? s.sheet.rows[r]?.[c] ?? "";
        if (comparable(f.kind, value) === comparable(f.kind, now)) continue;
        // アプリが空で、スプシに数字や日付として読めない文字 (「確認不能」など) があるときは消さない
        if ((value == null || value === "") && now.trim() && fromCell(f.kind, now) == null) continue;
        const to = toCell(f.kind, value);
        const cell = `${colLetter(c)}${r + 1}`;
        data.push({ range: `${quote(TAB)}!${cell}`, values: [[to]] });
        changes.push({ personId: b.personId, cell, header: f.header, from: now, to });
      }
    }
    if (data.length > 0) {
      await s.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: s.spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
    }
    return { changes, error: null };
  } catch (e) {
    return { changes, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 月末 (YYYY-MM-DD) */
export function monthEndOf(ymdStr: string): string {
  const [y, m] = ymdStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export type LedgerStepKey = "invoice" | "payment" | "partnerInvoice" | "partnerPayment";

/** 段階を「済」/ 取り消しにしたときの請求の値 */
export function billingPatchForStep(step: LedgerStepKey, done: boolean, today: string, current: Partial<PersonBilling> | null) {
  switch (step) {
    case "invoice":
      return done
        ? { invoiceStatus: "発行済", invoiceDate: current?.invoiceDate || today, dueDate: current?.dueDate || monthEndOf(current?.invoiceDate || today) }
        : { invoiceStatus: "未発行" };
    case "payment":
      return { paymentStatus: done ? "入金済" : "未入金" };
    case "partnerInvoice":
      return { partnerInvoiceStatus: done ? "受領済" : "未受領" };
    case "partnerPayment":
      return done ? { partnerPayStatus: "支払済", partnerPaidDate: current?.partnerPaidDate || today } : { partnerPayStatus: "未払い", partnerPaidDate: null };
  }
}

/** 請求の値から、段階が済か */
export function stepDoneFromBilling(step: LedgerStepKey, b: Partial<PersonBilling> | null): boolean | null {
  if (!b) return null;
  switch (step) {
    case "invoice":
      return b.invoiceStatus ? b.invoiceStatus === "発行済" : null;
    case "payment":
      return b.paymentStatus ? b.paymentStatus === "入金済" : null;
    case "partnerInvoice":
      return b.partnerInvoiceStatus ? b.partnerInvoiceStatus === "受領済" : null;
    case "partnerPayment":
      return b.partnerPayStatus ? b.partnerPayStatus === "支払済" : null;
  }
}
