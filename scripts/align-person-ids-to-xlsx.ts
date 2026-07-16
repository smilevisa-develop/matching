/**
 * 候補者データベース.xlsx の ID に系 (Person.id) を全件揃える。
 *
 * ★事前準備 (すでに完了): migration 20260716120000_person_id_on_update_cascade で
 *   Person への全 FK に ON UPDATE CASCADE を追加済み。
 *   Person.id を UPDATE すれば子テーブルの personId も自動追従する。
 *
 * ★安全戦略:
 *   1. xlsx 側の (id, 英語名, カナ名) を読み込む
 *   2. DB 側の Person 全件を取得
 *   3. 名前で突合 (英語名 or カナ名の完全一致 or 空白除去一致)
 *   4. 目標 ID にすでに別人がいる場合は 一時 ID (99999+n) に退避してから最終 ID に移動
 *   5. 全 UPDATE を prisma.$transaction で実行、失敗したら全ロールバック
 *   6. Person_id_seq をリセット
 *
 * ★使い方:
 *   DRY_RUN=1 npx tsx scripts/align-person-ids-to-xlsx.ts   # 計画表示のみ
 *   npx tsx scripts/align-person-ids-to-xlsx.ts              # 本実行
 *
 * ★xlsx 側の重複 ID や 系側の重複名は 曖昧マッチ として除外 → ログに出す。
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const XLSX_FILE = process.env.XLSX_FILE || `${process.env.HOME}/Downloads/候補者データベース (3).xlsx`;
const TEMP_ID_BASE = 900000; // 一時退避用の ID 帯 (系の実 ID とぶつからない値)

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

type XlsxRow = { id: number; englishName: string; kanaName: string };

/** 名前を正規化 (照合キー): 空白を全部除去、小文字化、カナ半角→全角/逆はしない */
function normalize(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .trim()
    .toLowerCase();
}

function readXlsx(): XlsxRow[] {
  const wb = XLSX.readFile(XLSX_FILE);
  const sheet = wb.Sheets["DB"];
  if (!sheet) throw new Error("DB シートが xlsx にありません");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  const out: XlsxRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const rawId = r?.[0];
    if (rawId === undefined || rawId === null || rawId === "") continue;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const englishName = String(r?.[2] ?? "").trim();
    const kanaName = String(r?.[3] ?? "").trim();
    out.push({ id, englishName, kanaName });
  }
  return out;
}

async function main() {
  console.log("============================================");
  console.log("Person.id を候補者DB.xlsx に合わせる");
  console.log(`DRY_RUN: ${DRY_RUN ? "✅ (DB 触らない)" : "❌ (本実行)"}`);
  console.log(`XLSX_FILE: ${XLSX_FILE}`);
  console.log("============================================\n");

  // ---- 1. xlsx を読む ----
  const xlsxRows = readXlsx();
  console.log(`xlsx: ${xlsxRows.length} 行\n`);

  // xlsx 側の 重複 ID (同じ ID が複数行に出てくる) を検出
  const xlsxIdCount = new Map<number, XlsxRow[]>();
  for (const r of xlsxRows) {
    if (!xlsxIdCount.has(r.id)) xlsxIdCount.set(r.id, []);
    xlsxIdCount.get(r.id)!.push(r);
  }
  const xlsxDupIds = Array.from(xlsxIdCount.entries()).filter(([, v]) => v.length > 1);
  if (xlsxDupIds.length > 0) {
    console.log("⚠️ xlsx 側で重複している ID:");
    for (const [id, rs] of xlsxDupIds) {
      console.log(`  ID ${id}:`);
      for (const r of rs) console.log(`    - ${r.englishName} / ${r.kanaName}`);
    }
    console.log("→ これらは xlsx 内で解消してから再実行してください。今回はスキップ。\n");
  }

  // ---- 2. 系の Person 全件 ----
  const persons = await prisma.person.findMany({
    select: {
      id: true,
      name: true,
      onboarding: { select: { englishName: true } },
    },
    orderBy: { id: "asc" },
  });
  console.log(`系: ${persons.length} 件\n`);

  // ---- 3. 突合 ----
  // 系側は「英語名 + カナ名」の両方でキー化 (どちらでもヒットさせる)
  type MatchInput = { id: number; kana: string; english: string };
  const systemById = new Map<number, MatchInput>();
  for (const p of persons) {
    systemById.set(p.id, {
      id: p.id,
      kana: p.name,
      english: p.onboarding?.englishName ?? "",
    });
  }

  // 正規化キー → 系 personId(s)
  const systemKeyToPersonIds = new Map<string, number[]>();
  const addKey = (key: string, pid: number) => {
    if (!key) return;
    if (!systemKeyToPersonIds.has(key)) systemKeyToPersonIds.set(key, []);
    const arr = systemKeyToPersonIds.get(key)!;
    if (!arr.includes(pid)) arr.push(pid);
  };
  for (const p of persons) {
    addKey(normalize(p.name), p.id);
    addKey(normalize(p.onboarding?.englishName), p.id);
  }

  const skipXlsxDup = new Set(xlsxDupIds.map(([id]) => id));

  const plan: { fromPid: number; toPid: number; label: string }[] = [];
  const ambiguous: { xlsx: XlsxRow; candidatePids: number[] }[] = [];
  const notFound: XlsxRow[] = [];

  for (const xr of xlsxRows) {
    if (skipXlsxDup.has(xr.id)) continue;
    const keys = [normalize(xr.englishName), normalize(xr.kanaName)].filter(Boolean);
    const matched = new Set<number>();
    for (const k of keys) {
      const pids = systemKeyToPersonIds.get(k) ?? [];
      for (const pid of pids) matched.add(pid);
    }
    if (matched.size === 0) {
      notFound.push(xr);
      continue;
    }
    if (matched.size > 1) {
      ambiguous.push({ xlsx: xr, candidatePids: Array.from(matched) });
      continue;
    }
    const [pid] = Array.from(matched);
    if (pid === xr.id) continue; // すでに一致
    plan.push({
      fromPid: pid,
      toPid: xr.id,
      label: `${xr.englishName || xr.kanaName}`,
    });
  }

  console.log(`📋 突合結果:`);
  console.log(`  一致 (変更不要): ${xlsxRows.length - notFound.length - ambiguous.length - plan.length - skipXlsxDup.size}`);
  console.log(`  ID 変更予定: ${plan.length}`);
  console.log(`  曖昧 (同名複数): ${ambiguous.length}`);
  console.log(`  未マッチ (xlsx にあるが系にない): ${notFound.length}`);
  console.log("");

  if (ambiguous.length > 0) {
    console.log("⚠️ 曖昧マッチ (スキップ、手動対応が必要):");
    for (const a of ambiguous) {
      console.log(`  xlsx ID=${a.xlsx.id} ${a.xlsx.englishName} / ${a.xlsx.kanaName}`);
      for (const pid of a.candidatePids) {
        const sp = systemById.get(pid)!;
        console.log(`    系候補 pid=${pid} ${sp.kana} / ${sp.english}`);
      }
    }
    console.log("");
  }

  if (notFound.length > 0) {
    console.log(`⚠️ 未マッチ (xlsx にあるが系にない ${notFound.length} 件):`);
    for (const nf of notFound) {
      console.log(`  xlsx ID=${nf.id} ${nf.englishName} / ${nf.kanaName}`);
    }
    console.log("");
  }

  if (plan.length === 0) {
    console.log("✅ 変更する必要はありません");
    await prisma.$disconnect();
    return;
  }

  console.log(`📝 ID 変更プラン (${plan.length} 件):`);
  for (const p of plan) {
    console.log(`  pid ${p.fromPid} → ${p.toPid}  (${p.label})`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — 実行しませんでした");
    await prisma.$disconnect();
    return;
  }

  // ---- 4. 一時退避 → 最終 ID に移動 (トランザクション) ----
  // 目標 ID にすでに人がいる場合、その人も plan に含まれている前提で、
  // 一時 ID に退避しておく順序で衝突を回避する。
  //
  //   step A: すべての「移動元 pid」を TEMP_ID (連番) に一斉退避
  //   step B: TEMP_ID → 最終 toPid に一斉移動
  //
  // これで A→B の中間に衝突が起きない。
  console.log("⚙️ 実行中...");
  await prisma.$transaction(async (tx) => {
    // step A: 退避
    const tempMap = new Map<number, number>(); // fromPid → tempId
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const tempId = TEMP_ID_BASE + i;
      tempMap.set(p.fromPid, tempId);
      await tx.$executeRawUnsafe(`UPDATE "Person" SET id = ${tempId} WHERE id = ${p.fromPid}`);
    }
    // step B: 最終位置へ
    for (const p of plan) {
      const tempId = tempMap.get(p.fromPid)!;
      await tx.$executeRawUnsafe(`UPDATE "Person" SET id = ${p.toPid} WHERE id = ${tempId}`);
    }
    // シーケンス再セット
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"Person"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Person"))`,
    );
  });
  console.log(`✅ ${plan.length} 件の ID 変更完了`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
