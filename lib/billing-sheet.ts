/**
 * 請求のタスクを終えたら、企業データベース「請求管理」タブのその人の行 (A 列の候補者ID) に書く。
 *
 *   企業へ請求書を送る      → 請求日 (終えた日) / 入金期日 (その月末) / 請求書「発行済」
 *   入金を確認する          → 請求ステータス「入金済」
 *   パートナーの請求書を受け取る → PAからの請求書「受領済」
 *   パートナーへ支払う      → 支払い有無「支払済」/ 支払日 (終えた日)
 *
 * 列は見出しの文字で探す (列の位置が変わっても追従する)。行が無ければ何もしない (行の追加は手で行う)。
 * 完了を取り消したときは書いた値を戻さない (誤って戻すより、手で直してもらう)。
 */

import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { getSheetsClient } from "@/lib/sheets-sync";
import type { BillingStepKey } from "@/lib/billing-flow";

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
const slash = (ymd: string) => ymd.replace(/-/g, "/");
const monthEnd = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  return `${y}/${String(m).padStart(2, "0")}/${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
};

/** 段階 → 書く列 (見出し) と値 */
function cellsFor(step: BillingStepKey, doneYmd: string, dueYmd: string | null): Record<string, string> {
  switch (step) {
    case "invoice":
      return { 請求日: slash(doneYmd), 入金期日: dueYmd ? monthEnd(dueYmd) : "", 請求書: "発行済" };
    case "payment":
      return { 請求ステータス: "入金済" };
    case "pa-invoice":
      return { PAからの請求書: "受領済" };
    case "pa-payment":
      return { 支払い有無: "支払済", 支払日: slash(doneYmd) };
    default:
      return {};
  }
}

export async function writeBillingStepToSheet(args: {
  personId: number;
  step: BillingStepKey;
  doneYmd: string;
  /** 請求書を送る日 (入金期日 = その月末 を計算するのに使う) */
  dueYmd: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const cells = Object.entries(cellsFor(args.step, args.doneYmd, args.dueYmd)).filter(([, v]) => v);
  if (cells.length === 0) return { ok: false, reason: "書く列が無い段階" };
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return { ok: false, reason: "企業データベースのスプシIDが未設定" };
  const sheets = await getSheetsClient();
  const rows = ((await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(TAB)}!A1:AZ2005` })).data.values ?? []).map((r) =>
    r.map((c) => String(c ?? "").trim()),
  );
  const header = rows[0] ?? [];
  const id = String(args.personId).padStart(4, "0");
  const row = rows.findIndex((r, i) => i > 0 && (r[0] === id || r[0] === String(args.personId)));
  if (row < 0) return { ok: false, reason: `請求管理に候補者 ${id} の行が無い` };
  const data: { range: string; values: string[][] }[] = [];
  for (const [title, value] of cells) {
    const col = header.findIndex((h) => h === title);
    if (col < 0) continue;
    data.push({ range: `${quote(TAB)}!${colLetter(col)}${row + 1}`, values: [[value]] });
  }
  if (data.length === 0) return { ok: false, reason: "見出しが見つからない" };
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  return { ok: true };
}

/**
 * 請求管理の行から、もう終わっている段階を読む (請求の列に入れたとき、終わった作業を「期限切れ」にしないため)。
 *   請求書「発行済」→ 請求書を送った / 請求ステータス「入金済」→ 入金を確認した /
 *   PAからの請求書「受領済」→ パートナーへの依頼・受け取り済み / 支払い有無「支払済」→ 支払った
 */
export async function readBillingDoneSteps(personId: number): Promise<Set<BillingStepKey>> {
  const done = new Set<BillingStepKey>();
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return done;
  const sheets = await getSheetsClient();
  const rows = ((await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(TAB)}!A1:AZ2005` })).data.values ?? []).map((r) =>
    r.map((c) => String(c ?? "").trim()),
  );
  const header = rows[0] ?? [];
  const id = String(personId).padStart(4, "0");
  const row = rows.find((r, i) => i > 0 && (r[0] === id || r[0] === String(personId)));
  if (!row) return done;
  const v = (title: string) => {
    const col = header.findIndex((h) => h === title);
    return col >= 0 ? row[col] ?? "" : "";
  };
  if (v("請求書") === "発行済" || v("請求日")) done.add("invoice");
  if (v("請求ステータス") === "入金済") done.add("payment");
  if (v("PAからの請求書") === "受領済") {
    done.add("pa-request");
    done.add("pa-invoice");
  }
  if (v("支払い有無") === "支払済") done.add("pa-payment");
  return done;
}
