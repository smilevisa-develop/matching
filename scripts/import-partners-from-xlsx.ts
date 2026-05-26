/**
 * パートナーデータベース.xlsx (アライアンス先) から全パートナーを取り込む。
 *
 * シート構成 (1 ファイルに複数シート):
 *   - 学校 / 日本 / ベトナム / 中国 / インドネシア / ミャンマー / ネパール /
 *     スリランカ / カンボジア / バングラデシュ / インド / フィリピン /
 *     インドネシア送り出し機関(候補) など
 *   各シート 1 行目: 説明行、2 行目: ヘッダー、3 行目以降: データ
 *
 * ヘッダー (主要):
 *   番号 / 関係性 / 名前 / 担当者名 / 国 / 役割 / 連絡先(メールアドレス) /
 *   連絡先(SNS) / 備考(特徴や強みなど) / 手数料金額 / 最低金額 / 配分比率
 *
 * 既定の挙動 (RESET=1):
 *   - 既存パートナーを全削除してから取り込み (関連 deal/invoice/group はそのまま、
 *     partnerId は SetNull で外れる)
 *   - 評価履歴 (PartnerRatingHistory) はパートナー削除に連動して Cascade 削除
 *   - シート名を country として保存 (シート上の「国」列があれば優先)
 *
 * 使い方:
 *   RESET=1 npx tsx scripts/import-partners-from-xlsx.ts
 *   FILE=/path/to.xlsx で xlsx パス指定可 (既定: ~/Downloads/パートナーデータベース.xlsx)
 *   DRY_RUN=1 で書き込まず件数だけ確認
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const FILE = process.env.FILE || `${process.env.HOME}/Downloads/パートナーデータベース.xlsx`;
const RESET = process.env.RESET === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });

// ---------- helpers ----------
function s(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function rowsOf(filePath: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

function listSheets(filePath: string): string[] {
  const wb = XLSX.readFile(filePath);
  return wb.SheetNames;
}

function headersOf(row: unknown[]): (string | null)[] {
  return row.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
}

function record(headers: (string | null)[], row: unknown[]): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (h) rec[h] = row[i] ?? null;
  });
  return rec;
}

function csvFromString(v: string | null): string | null {
  if (!v) return null;
  const arr = v
    .split(/[,、，;；・\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length === 0 ? null : [...new Set(arr)].join(",");
}

// シート名 → 既定の country
function sheetToCountry(sheet: string): string | null {
  const COUNTRY_BY_SHEET: Record<string, string> = {
    日本: "日本",
    ベトナム: "ベトナム",
    中国: "中国",
    インドネシア: "インドネシア",
    ミャンマー: "ミャンマー",
    ネパール: "ネパール",
    スリランカ: "スリランカ",
    カンボジア: "カンボジア",
    バングラデシュ: "バングラデシュ",
    インド: "インド",
    フィリピン: "フィリピン",
    タイ: "タイ",
    モンゴル: "モンゴル",
    韓国: "韓国",
  };
  for (const [key, val] of Object.entries(COUNTRY_BY_SHEET)) {
    if (sheet.includes(key)) return val;
  }
  if (sheet.includes("送り出し") || sheet.includes("送出")) {
    // "インドネシア送り出し機関(候補)" のような場合
    for (const [key, val] of Object.entries(COUNTRY_BY_SHEET)) {
      if (sheet.includes(key)) return val;
    }
  }
  return null;
}

// シート名 → 既定の役割 (シート上の役割列があれば優先)
function defaultRoleForSheet(sheet: string): string | null {
  if (sheet.includes("学校")) return "学校";
  if (sheet.includes("送り出し")) return "送り出し機関";
  return null;
}

async function main() {
  console.log(`== パートナー一括取り込み from ${FILE} ${RESET ? "(RESET)" : ""}${DRY_RUN ? " [DRY-RUN]" : ""} ==`);

  const sheets = listSheets(FILE);
  console.log(`  シート: ${sheets.join(" / ")}`);

  // 取り込むシートのみフィルタ (「一覧」「(移動前)」「説明」などは除外)
  const SKIP_PATTERNS = [/移動前/, /説明/, /例\)/, /^マスタ$/i, /^Master$/i];
  const targetSheets = sheets.filter((s) => !SKIP_PATTERNS.some((re) => re.test(s)));
  console.log(`  取り込み対象: ${targetSheets.join(" / ")}`);

  // === RESET フェーズ ===
  if (RESET && !DRY_RUN) {
    const before = await prisma.partner.count();
    await prisma.partner.deleteMany({});
    console.log(`  RESET: ${before} 件を削除`);
  }

  let totalParsed = 0;
  let totalCreated = 0;

  for (const sheet of targetSheets) {
    const rows = rowsOf(FILE, sheet);
    if (rows.length < 3) {
      console.log(`  [${sheet}] スキップ (3 行未満)`);
      continue;
    }
    // 2 行目をヘッダーと仮定 (1 行目は説明 / 注釈)
    const headers = headersOf(rows[1] as unknown[]);
    const sheetCountry = sheetToCountry(sheet);
    const sheetRole = defaultRoleForSheet(sheet);
    let sheetCreated = 0;

    for (let i = 2; i < rows.length; i++) {
      const rec = record(headers, rows[i] as unknown[]);
      const name = s(rec["名前"]) || s(rec["パートナー名"]);
      if (!name) continue;

      const relation = s(rec["関係性"]);
      const hasPerformance = relation ? relation.includes("実績有り") || relation.includes("有") : false;

      const data = {
        name,
        country: s(rec["国"]) ?? sheetCountry,
        role: s(rec["役割"]) ?? sheetRole,
        hasPerformance,
        contactName: s(rec["担当者名"]) ?? s(rec["担当者"]),
        email: s(rec["連絡先(メールアドレス)"]) ?? s(rec["メールアドレス"]) ?? s(rec["メール"]),
        snsContact:
          s(rec["連絡先(SNS)"]) ??
          s(rec["SNS"]) ??
          s(rec["連絡先SNS"]) ??
          s(rec["LINE"]) ??
          null,
        features: s(rec["備考(特徴や強みなど)"]) ?? s(rec["備考"]) ?? s(rec["特徴"]),
        feeAmount: s(rec["手数料金額"]) ?? s(rec["手数料"]),
        minFeeAmount: s(rec["最低金額"]),
        feeShareRatio: s(rec["配分比率"]),
        introducibleScope:
          sheetCountry === "日本"
            ? "国内"
            : sheetCountry && sheetCountry !== "日本"
              ? "国外"
              : null,
        introducibleNationalities: sheetCountry && sheetCountry !== "日本" ? sheetCountry : null,
        introducibleFields: csvFromString(s(rec["分野"]) ?? s(rec["紹介可能分野"])),
        introducibleResidenceStatuses: csvFromString(
          s(rec["在留資格"]) ?? s(rec["紹介可能在留資格"])
        ),
        linkStatus: "未",
        channel: null,
        notes: null,
        rating: null,
        ratingReason: null,
      };

      totalParsed++;
      if (DRY_RUN) {
        sheetCreated++;
        continue;
      }

      // 名前 + 国の組み合わせで既存があれば update、無ければ create
      const existing = await prisma.partner.findFirst({
        where: { name, country: data.country },
        select: { id: true },
      });
      if (existing) {
        await prisma.partner.update({ where: { id: existing.id }, data });
      } else {
        await prisma.partner.create({ data });
        sheetCreated++;
      }
    }
    totalCreated += sheetCreated;
    console.log(`  [${sheet}] 作成 ${sheetCreated} 件`);
  }

  console.log(
    `\n✅ 完了: パース ${totalParsed} 行 / 新規作成 ${totalCreated} 件${DRY_RUN ? " (DRY-RUN)" : ""}`
  );
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
