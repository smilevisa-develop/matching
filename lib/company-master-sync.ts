/**
 * 企業マスタ (Google スプレッドシート) を Company に同期する。
 *
 * 企業マスタは「企業ID / 企業名 / 分野」を持つ。これを正として:
 *   - Company.externalId(企業ID) を小文字に統一
 *   - 企業ID(小文字) で突き合わせ、name / industry をマスタ値に更新
 *   - マスタに在って DB に無い企業は新規作成
 *
 * スプシ側の要件:
 *   - サービスアカウント (GOOGLE_SERVICE_ACCOUNT_EMAIL) に閲覧権限を共有しておくこと
 *   - 1 行目〜どこかに「企業ID / 企業名 / 分野」を含むヘッダ行があり、その下にデータ
 */

import { prisma } from "@/lib/prisma";
import { getSheetsClient } from "@/lib/sheets-sync";

export type MasterRow = { externalId: string; name: string; industry: string | null };

/** 既定の企業マスタスプシ (COMPANY_MASTER_SHEET_URL 未設定時に使用) */
export const DEFAULT_COMPANY_MASTER_URL =
  "https://docs.google.com/spreadsheets/d/1S5wQF99n_-1nka8KNjrxKmrjCPQKIauRuDXjlSZi8hY/edit";

/** URL / ID どちらでもスプレッドシート ID を取り出す */
export function parseSpreadsheetId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

/** 企業マスタのスプレッドシート ID を解決 (env 優先・既定にフォールバック) */
export function resolveCompanyMasterSpreadsheetId(): string | null {
  const url = process.env.COMPANY_MASTER_SHEET_URL?.trim() || DEFAULT_COMPANY_MASTER_URL;
  return parseSpreadsheetId(url);
}

/** 企業マスタのスプシからマスタ行を読む (ヘッダを自動検出) */
export async function readCompanyMasterFromSheet(spreadsheetId: string): Promise<MasterRow[]> {
  const sheets = await getSheetsClient();
  // 先頭タブを対象 (通常「企業マスタ」)
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,index)",
  });
  const first = (meta.data.sheets ?? [])
    .slice()
    .sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0))[0];
  const tab = first?.properties?.title ?? "企業マスタ";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab.replace(/'/g, "''")}'!A1:E1000`,
  });
  const rows = res.data.values ?? [];

  // ヘッダ行 (企業ID を含む行) を探す
  let headerIdx = -1;
  let idCol = 0;
  let nameCol = 1;
  let indCol = 2;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map((c) => String(c ?? "").trim());
    const iId = row.findIndex((c) => c === "企業ID");
    if (iId >= 0) {
      headerIdx = i;
      idCol = iId;
      const iName = row.findIndex((c) => c === "企業名");
      const iInd = row.findIndex((c) => c === "分野");
      if (iName >= 0) nameCol = iName;
      if (iInd >= 0) indCol = iInd;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("企業マスタのヘッダ (企業ID) が見つかりません");

  const byId = new Map<string, MasterRow>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const externalId = String(row[idCol] ?? "").trim().toLowerCase();
    const name = String(row[nameCol] ?? "").trim();
    if (!externalId || !name) continue;
    const industry = String(row[indCol] ?? "").trim() || null;
    byId.set(externalId, { externalId, name, industry }); // 重複は後勝ち
  }
  return [...byId.values()];
}

/** マスタ行を Company に upsert (apply=false でドライラン) */
export async function upsertCompanyMaster(master: MasterRow[], apply: boolean) {
  const companies = await prisma.company.findMany({
    select: { id: true, externalId: true, name: true, industry: true },
  });
  const byLc = new Map<string, (typeof companies)[number]>();
  for (const c of companies) if (c.externalId) byLc.set(c.externalId.toLowerCase(), c);

  const created: string[] = [];
  const updated: string[] = [];
  let unchanged = 0;

  if (apply) {
    for (const c of companies) {
      if (c.externalId && c.externalId !== c.externalId.toLowerCase()) {
        await prisma.company.update({
          where: { id: c.id },
          data: { externalId: c.externalId.toLowerCase() },
        });
      }
    }
  }

  for (const m of master) {
    const d = byLc.get(m.externalId);
    if (!d) {
      created.push(`${m.externalId} ${m.name}`);
      if (apply) {
        await prisma.company.create({
          data: { name: m.name, industry: m.industry, externalId: m.externalId },
        });
      }
      continue;
    }
    if (d.name !== m.name || (d.industry ?? "") !== (m.industry ?? "")) {
      updated.push(`${m.externalId}: ${d.name} → ${m.name}`);
      if (apply) {
        await prisma.company.update({
          where: { id: d.id },
          data: { name: m.name, industry: m.industry },
        });
      }
    } else {
      unchanged++;
    }
  }

  return { masterCount: master.length, created, updated, unchangedCount: unchanged };
}
