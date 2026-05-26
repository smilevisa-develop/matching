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

  // 取り込み対象から除外するシート
  //   - 「一覧（移動前）」: 国別シートに分かれているので重複になる
  //   - 「管理シート」: SNS の登録人数管理。パートナー情報ではない
  //   - 「セット」: 設定/テンプレ
  const SKIP_PATTERNS = [/移動前/, /管理シート/, /^セット$/, /説明/, /例\)/];
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
    // 送り出し機関(候補)シートは別構成 (1 行目にヘッダー、ID/会社名・学校名 等)
    if (/送り出し機関/.test(sheet)) {
      const n = await importSendingOrganizations(sheet);
      totalParsed += n.parsed;
      totalCreated += n.created;
      console.log(`  [${sheet}] 作成 ${n.created} 件`);
      continue;
    }

    const rows = rowsOf(FILE, sheet);
    if (rows.length < 3) {
      console.log(`  [${sheet}] スキップ (3 行未満)`);
      continue;
    }
    // 2 行目をヘッダーと仮定 (1 行目は説明 / 注釈)
    const headers = headersOf(rows[1] as unknown[]);
    const sheetCountry = sheetToCountry(sheet);
    const sheetRole = defaultRoleForSheet(sheet);
    const isStopped = /取引停止/.test(sheet);
    let sheetCreated = 0;

    for (let i = 2; i < rows.length; i++) {
      const rec = record(headers, rows[i] as unknown[]);
      const name = s(rec["名前"]) || s(rec["パートナー名"]);
      if (!name) continue;

      const relation = s(rec["関係性"]);
      const stoppedFromRelation = relation ? relation.includes("取引停止") || relation.includes("停止") : false;
      const stopped = isStopped || stoppedFromRelation;
      const hasPerformance =
        !stopped && (relation ? relation.includes("実績有り") || relation.includes("有") : false);

      const rawCountryCell = s(rec["国"]);
      // シート名から決まる正規 country を優先。
      // 国列に複数 (改行/カンマ/、/+) や 11 文字以上が入っていれば、
      // それは「紹介可能な国籍リスト」とみなして introducibleNationalities へ
      const looksMulti =
        !!rawCountryCell &&
        (/[\n、,，+]/.test(rawCountryCell) || rawCountryCell.length > 10);
      const canonicalCountry = sheetCountry ?? (looksMulti ? null : rawCountryCell);
      const introNatFromCell = looksMulti ? csvFromString(rawCountryCell) : null;
      const introNatFromSheet =
        sheetCountry && sheetCountry !== "日本" ? sheetCountry : null;

      const data = {
        name,
        country: canonicalCountry,
        role: s(rec["役割"]) ?? sheetRole,
        hasPerformance,
        contactName: s(rec["担当者名"]) ?? s(rec["担当者"]),
        email: s(rec["連絡先(メールアドレス)"]) ?? s(rec["メールアドレス"]) ?? s(rec["メール"]),
        snsContact:
          s(rec["連絡先(SNS)"]) ?? s(rec["SNS"]) ?? s(rec["連絡先SNS"]) ?? s(rec["LINE"]) ?? null,
        features: buildFeatures({
          base: s(rec["備考(特徴や強みなど)"]) ?? s(rec["備考"]) ?? s(rec["特徴"]),
          stopped,
        }),
        feeAmount: s(rec["手数料金額"]) ?? s(rec["手数料"]),
        minFeeAmount: s(rec["最低金額"]),
        feeShareRatio: s(rec["配分比率"]) ? String(s(rec["配分比率"])) : null,
        introducibleScope:
          canonicalCountry === "日本"
            ? "国内"
            : canonicalCountry && canonicalCountry !== "日本"
              ? "国外"
              : null,
        // 国列の多国籍リスト or シート国 のいずれか
        introducibleNationalities: introNatFromCell ?? introNatFromSheet,
        introducibleFields: csvFromString(s(rec["分野"]) ?? s(rec["紹介可能分野"])),
        introducibleResidenceStatuses: csvFromString(
          s(rec["在留資格"]) ?? s(rec["紹介可能在留資格"])
        ),
        linkStatus: stopped ? "停止" : "未",
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

function buildFeatures({ base, stopped }: { base: string | null; stopped: boolean }): string | null {
  const parts: string[] = [];
  if (stopped) parts.push("[取引停止]");
  if (base) parts.push(base);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * 「インドネシア送り出し機関（候補）」シート用の特殊取り込み。
 * ヘッダー構成 (R1):
 *   番号 / ID / 会社名・学校名 / Address / URL / 担当者 / 電話番号 / メール /
 *   担当者名(2人目) / Address(2人目) / PHONE(2人目) / メール(2人目)
 */
async function importSendingOrganizations(sheet: string): Promise<{ parsed: number; created: number }> {
  const rows = rowsOf(FILE, sheet);
  let parsed = 0;
  let created = 0;
  if (rows.length < 2) return { parsed, created };

  // 1 行目をヘッダーとして使い、2 行目以降データ
  // ただし「ID」が空の行はスキップ
  const header = headersOf(rows[0] as unknown[]);
  // 列インデックスを名前で引けるよう map 化
  const colIndex = (key: string) => header.findIndex((h) => h === key);
  const idIdx = colIndex("ID");
  const nameIdx = colIndex("会社名・学校名");
  const addressIdx = colIndex("Address");
  const urlIdx = colIndex("URL");

  // "担当者" / "担当者名" / "電話番号" / "メール" などは複数登場するので index 配列で持つ
  const findAllIdx = (key: string) =>
    header.map((h, i) => (h === key ? i : -1)).filter((i) => i >= 0);
  const contactNameIdxs = [...findAllIdx("担当者"), ...findAllIdx("担当者名")];
  const phoneIdxs = [...findAllIdx("電話番号"), ...findAllIdx("PHONE")];
  const emailIdxs = findAllIdx("メール");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row) continue;
    const id = s(row[idIdx] as unknown);
    const name = s(row[nameIdx] as unknown);
    if (!id && !name) continue;
    if (!name) continue;

    const contacts: string[] = [];
    for (const ci of contactNameIdxs) {
      const v = s(row[ci] as unknown);
      if (v) contacts.push(v);
    }
    const phones: string[] = [];
    for (const pi of phoneIdxs) {
      const v = s(row[pi] as unknown);
      if (v) phones.push(v);
    }
    const emails: string[] = [];
    for (const ei of emailIdxs) {
      const v = s(row[ei] as unknown);
      if (v) emails.push(v);
    }

    const featuresParts: string[] = ["[送り出し機関(候補)]"];
    if (id) featuresParts.push(`外部 ID: ${id}`);
    if (row[addressIdx]) featuresParts.push(`住所: ${s(row[addressIdx] as unknown)}`);
    if (row[urlIdx]) featuresParts.push(`URL: ${s(row[urlIdx] as unknown)}`);
    if (phones.length > 0) featuresParts.push(`電話: ${phones.join(" / ")}`);

    const data = {
      name,
      country: "インドネシア",
      role: "送り出し機関",
      hasPerformance: false,
      contactName: contacts.join(" / ") || null,
      email: emails.join(" / ") || null,
      snsContact: null,
      features: featuresParts.join("\n"),
      feeAmount: null,
      minFeeAmount: null,
      feeShareRatio: null,
      introducibleScope: "国外",
      introducibleNationalities: "インドネシア",
      introducibleFields: null,
      introducibleResidenceStatuses: null,
      linkStatus: "未",
      channel: null,
      notes: null,
      rating: null,
      ratingReason: null,
    };

    parsed++;
    if (DRY_RUN) {
      created++;
      continue;
    }

    const existing = await prisma.partner.findFirst({
      where: { name, country: data.country },
      select: { id: true },
    });
    if (existing) {
      await prisma.partner.update({ where: { id: existing.id }, data });
    } else {
      await prisma.partner.create({ data });
      created++;
    }
  }

  return { parsed, created };
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
