/**
 * 企業の支援方法。スプシ「企業マスタ」E列 (支援方法) のプルダウンと同じ選択肢・同じ表記にしている。
 * システムで変えたら企業マスタの E 列にも書く。
 */
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { COMPANY_MASTER_TAB } from "@/lib/deal-sheet-sync";
import { getSheetsClient } from "@/lib/sheets-sync";

export { SUPPORT_METHODS, normalizeSupportMethod } from "@/lib/company-options";

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

/** 企業マスタの「支援方法」列に書く (企業IDで行を探す)。行が無ければ何もしない。失敗は投げずに理由を返す */
export async function writeSupportMethodToMaster(externalId: string | null, value: string | null): Promise<string> {
  const id = (externalId ?? "").trim().toLowerCase();
  if (!id) return "企業IDなし";
  const spreadsheetId = resolveCompanyMasterSpreadsheetId();
  if (!spreadsheetId) return "スプシ未設定";
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(COMPANY_MASTER_TAB)}!A1:Z2000` });
    const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
    let headerRow = -1;
    let nameCol = -1;
    let methodCol = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const n = rows[i].findIndex((c) => c.trim() === "企業名");
      if (n >= 0) {
        headerRow = i;
        nameCol = n;
        methodCol = rows[i].findIndex((c) => c.trim() === "支援方法");
        break;
      }
    }
    if (headerRow < 0 || methodCol < 0) return "企業マスタに「支援方法」列が無い";
    const idCol = Math.max(0, nameCol - 1);
    for (let i = headerRow + 1; i < rows.length; i++) {
      if ((rows[i][idCol] ?? "").trim().toLowerCase() === id) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quote(COMPANY_MASTER_TAB)}!${colLetter(methodCol)}${i + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[value ?? ""]] },
        });
        return `企業マスタ ${colLetter(methodCol)}${i + 1} に書いた`;
      }
    }
    return "企業マスタに行が無い (同期で追加されたあとに書かれる)";
  } catch (e) {
    console.warn("支援方法のスプシ反映に失敗:", e instanceof Error ? e.message : e);
    return "エラー";
  }
}
