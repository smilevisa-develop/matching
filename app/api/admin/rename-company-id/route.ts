/**
 * 企業IDを付け替える (要ログイン)。システムの企業と、スプシ「企業マスタ」の同じ行の ID を一緒に直す。
 * (同期は企業マスタを ID で照合するので、システムだけ変えると新しい行が足されて二重になる)
 *
 * GET  /api/admin/rename-company-id?from=01sv&to=01ag   どの行が変わるかを返すだけ
 * POST /api/admin/rename-company-id  { from, to }       実行
 *
 * Drive の企業フォルダ名 (先頭に企業ID) は変えない。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { COMPANY_MASTER_TAB } from "@/lib/deal-sheet-sync";
import { COMPANY_EXTERNAL_ID_RE } from "@/lib/deal-stages";
import { getSheetsClient } from "@/lib/sheets-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quote = (n: string) => `'${n.replace(/'/g, "''")}'`;
const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

async function plan(from: string, to: string) {
  if (!COMPANY_EXTERNAL_ID_RE.test(to)) throw new Error(`新しい企業ID "${to}" は半角英数字にしてください`);
  const company = await prisma.company.findUnique({ where: { externalId: from }, select: { id: true, name: true } });
  if (!company) throw new Error(`企業ID "${from}" の企業がありません`);
  const dup = await prisma.company.findUnique({ where: { externalId: to }, select: { name: true } });
  if (dup) throw new Error(`企業ID "${to}" は「${dup.name}」で使われています`);

  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) throw new Error("企業データベースのスプシIDが未設定");
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(COMPANY_MASTER_TAB)}!A1:Z2000` });
  const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
  let headerRow = -1;
  let nameCol = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const j = rows[i].findIndex((c) => c.trim() === "企業名");
    if (j >= 0) {
      headerRow = i;
      nameCol = j;
      break;
    }
  }
  if (headerRow < 0) throw new Error("企業マスタの見出し (企業名) が見つかりません");
  const idCol = Math.max(0, nameCol - 1);
  const hits: { row: number; name: string }[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    if ((rows[i][idCol] ?? "").trim().toLowerCase() === from) hits.push({ row: i + 1, name: rows[i][nameCol] ?? "" });
  }
  return { company, spreadsheetId, sheets, idCol, hits };
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const u = new URL(req.url);
    const { company, hits } = await plan(norm(u.searchParams.get("from")), norm(u.searchParams.get("to")));
    return Response.json({ ok: true, company, sheetRows: hits });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const from = norm(body.from);
    const to = norm(body.to);
    const { company, spreadsheetId, sheets, idCol, hits } = await plan(from, to);
    if (hits.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: hits.map((h) => ({ range: `${quote(COMPANY_MASTER_TAB)}!${colLetter(idCol)}${h.row}`, values: [[to]] })),
        },
      });
    }
    await prisma.company.update({ where: { id: company.id }, data: { externalId: to } });
    return Response.json({ ok: true, company: company.name, from, to, sheetRows: hits });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
