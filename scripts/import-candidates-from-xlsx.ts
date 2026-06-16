/**
 * 候補者データベース.xlsx から新規候補者を追加する改善版スクリプト
 *
 * 過去の失敗を踏まえた設計:
 *   ① 既存 ID は絶対に触らない (DB の現データを上書きしない)
 *   ② 顔写真は新規作成した候補者にのみ反映 (履歴書収集フォームから取得)
 *   ③ 名前マッチングを 3 段階で厳格化 (完全一致 → 空白正規化 → 編集距離 90%+)
 *   ④ xlsx 内の ID 重複を検出して警告 (1 件目を採用)
 *   ⑤ 全フィールド `|| undefined` で null 上書き事故を防止
 *   ⑥ 実行サマリーで写真ノーマッチ件を提示 (手動対応リスト)
 *
 * 使い方:
 *   FILE="/Users/.../候補者データベース (2).xlsx" npx tsx scripts/import-candidates-from-xlsx.ts
 *   FROM_ID=192 TO_ID=999 で範囲指定 (省略時は「DBの現在最大ID+1 以上 全部」)
 *   DRY_RUN=1 を付けると DB 書き込みせずプレビューだけ
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { parseFlexibleDate } from "../lib/flexible-date";
import { toDriveThumbUrl } from "../lib/drive-url";

const FILE = process.env.FILE || `${process.env.HOME}/Downloads/候補者データベース.xlsx`;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

// ===== util =====
function s(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function d(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dStr(value: unknown): string | null {
  const date = d(value);
  if (date) return date.toISOString().slice(0, 10);
  const r = parseFlexibleDate(value);
  if (r && r.type === "iso") return r.value;
  if (r && r.type === "current") return null;
  return s(value);
}

function normalizeNationality(value: unknown): string {
  const v = s(value);
  if (!v) return "その他";
  const known = ["ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ"];
  for (const n of known) if (v.includes(n)) return n;
  return v;
}

function normalizeResidenceStatus(value: unknown): string {
  const v = s(value);
  if (!v) return "不明";
  if (v.includes("実習")) return "技能実習";
  if (v.includes("特定技能1") || v.includes("特定技能一")) return "特定技能1号";
  if (v.includes("特定技能2") || v.includes("特定技能二")) return "特定技能2号";
  if (v.includes("技術") || v.includes("技人国")) return "技術・人文知識・国際業務";
  if (v.includes("留学")) return "留学生";
  if (v.includes("特定活動")) return "特定活動";
  if (v.includes("持っていない") || v.includes("持ってない") || v.includes("なし")) return "持っていない";
  if (v.includes("永住")) return "永住";
  if (v.includes("不明") || v === "?") return "不明";
  return v;
}

// 名前正規化: 全角/半角空白 → 統一、前後 trim
function normName(name: string): string {
  return name.replace(/[\s　]+/g, "").toLowerCase();
}

// 編集距離 (Levenshtein)
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

// 類似度 0..1 (1=完全一致)
function similarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return 1;
  const dist = editDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

// 3 段階マッチ: created 候補者群の中から、フォーム行の kana に最も合う候補者を返す
function findBestMatch(
  formKana: string,
  candidates: { id: number; name: string }[]
): { match: { id: number; name: string }; stage: "exact" | "normalized" | "fuzzy"; score: number } | null {
  if (candidates.length === 0) return null;
  const normForm = normName(formKana);

  // Stage A: 完全一致 (正規化後)
  for (const c of candidates) {
    if (normName(c.name) === normForm) {
      return { match: c, stage: "exact", score: 1 };
    }
  }

  // Stage B: 部分一致 (一方が他方を完全に含む = 入れ子。確実な場合のみ)
  // 例: フォームが "グエン　レー　ホン　フォン", DB が "グエンレーホンフォン"
  // 既に normName で空白除去済みなので、ここでは「片方が他方を完全に含む」を確認
  for (const c of candidates) {
    const dbN = normName(c.name);
    if (dbN.length >= 6 && normForm.length >= 6 && (dbN.includes(normForm) || normForm.includes(dbN))) {
      return { match: c, stage: "normalized", score: 0.95 };
    }
  }

  // Stage C: 編集距離による fuzzy match (90% 以上)
  let bestScore = 0;
  let bestMatch: { id: number; name: string } | null = null;
  for (const c of candidates) {
    const sc = similarity(formKana, c.name);
    if (sc > bestScore) {
      bestScore = sc;
      bestMatch = c;
    }
  }
  if (bestMatch && bestScore >= 0.9) {
    return { match: bestMatch, stage: "fuzzy", score: bestScore };
  }
  return null;
}

async function resolvePartnerByName(name: string | null): Promise<number | null> {
  if (!name) return null;
  const partner = await prisma.partner.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  return partner?.id ?? null;
}

// ===== xlsx 読込 =====
function readSheet(filePath: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`シートが見つかりません: ${sheetName} in ${filePath}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
}

function rowToRecord(headers: (string | null)[], row: unknown): Record<string, unknown> {
  const arr = Array.isArray(row) ? row : [];
  const rec: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h) rec[h] = arr[i];
  }
  return rec;
}

// ===== main =====
async function main() {
  console.log("============================================");
  console.log("候補者リスト更新 (改善版)");
  console.log("ファイル:", FILE);
  console.log("DRY_RUN:", DRY_RUN ? "✅ プレビューのみ (DB 書き込まない)" : "❌ 本実行 (DB 書き込み)");
  console.log("============================================\n");

  // 既存 ID と最大値を取得
  const existingIds = new Set(
    (await prisma.person.findMany({ select: { id: true } })).map((p) => p.id)
  );
  const dbCurrentMax = Math.max(...Array.from(existingIds), 0);
  const FROM_ID = Number(process.env.FROM_ID ?? dbCurrentMax + 1);
  const TO_ID = Number(process.env.TO_ID ?? 99999);
  console.log(`DB 現在最大 ID = ${dbCurrentMax}`);
  console.log(`取込対象範囲 = ${FROM_ID} 〜 ${TO_ID}\n`);

  // ===== DB シート読み込み =====
  const dbRows = readSheet(FILE, "DB");
  const dbHeaderRow = (dbRows[1] ?? []) as unknown[];
  const dbHeaders = dbHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));

  // ID 重複を事前検出
  const idSeen = new Map<number, number>(); // id -> 出現回数
  const candidatesFromXlsx: { id: number; rec: Record<string, unknown> }[] = [];
  for (let i = 2; i < dbRows.length; i++) {
    const rec = rowToRecord(dbHeaders, dbRows[i]);
    const idStr = s(rec["ID"]);
    if (!idStr) continue;
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum)) continue;
    if (idNum < FROM_ID || idNum > TO_ID) continue;
    idSeen.set(idNum, (idSeen.get(idNum) ?? 0) + 1);
    // 既に同じ ID を見たならスキップ (1 件目を採用)
    if (idSeen.get(idNum) === 1) {
      candidatesFromXlsx.push({ id: idNum, rec });
    } else {
      console.warn(`⚠️  ID 重複: ID=${idNum} は xlsx で ${idSeen.get(idNum)} 回目の出現。1 件目を採用し、これは無視。`);
    }
  }
  const duplicates = Array.from(idSeen.entries()).filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    console.log(`⚠️  ID 重複 ${duplicates.length} 件: ${duplicates.map(([id, c]) => `${id}×${c}`).join(", ")}\n`);
  }

  console.log(`xlsx 対象範囲内: ${candidatesFromXlsx.length} 件`);

  // ===== 履歴書収集フォーム シート読み込み =====
  const formRows = readSheet(FILE, "履歴書収集フォーム");
  const formHeaderRow = (formRows[0] ?? []) as unknown[];
  const formHeaders = formHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
  const formRecords: Record<string, unknown>[] = [];
  for (let i = 1; i < formRows.length; i++) {
    const rec = rowToRecord(formHeaders, formRows[i]);
    if (s(rec["カタカナ名"])) formRecords.push(rec);
  }
  console.log(`フォーム回答: ${formRecords.length} 件`);

  // ===== 1. Person 新規作成 =====
  console.log("\n== Person 新規作成 ==");
  let created = 0;
  let skippedExist = 0;
  const createdPeople: { id: number; name: string }[] = [];

  for (const { id: idNum, rec } of candidatesFromXlsx) {
    const name = s(rec["カタカナ名"]) || s(rec["候補者名"]);
    if (!name) {
      console.log(`  ⏭  ID=${idNum}: 名前が無い → スキップ`);
      continue;
    }
    if (existingIds.has(idNum)) {
      console.log(`  ⏭  ID=${idNum} (${name}): 既存 → スキップ (既存データ温存)`);
      skippedExist++;
      continue;
    }

    const englishName = s(rec["候補者名"]);
    const partnerId = await resolvePartnerByName(s(rec["パートナー"]));
    const addressParts = [s(rec["都道府県"]), s(rec["現住所"])].filter(Boolean);
    const address = addressParts.join(" ") || null;

    if (DRY_RUN) {
      console.log(`  [DRY] 作成予定 ID=${idNum} ${name} (英: ${englishName ?? "-"}, パートナー: ${partnerId ?? "?"})`);
    } else {
      await prisma.person.create({
        data: {
          id: idNum,
          name,
          nationality: normalizeNationality(rec["国籍"]),
          residenceStatus: normalizeResidenceStatus(rec["在留資格"]),
          channel: "未設定",
          partnerId,
          driveFolderUrl: s(rec["書類フォルダリンク"]),
          onboarding: {
            create: {
              englishName,
              birthDate: dStr(rec["生年月日"]),
              address,
              postalCode: s(rec["郵便番号"]),
              status: "submitted",
            },
          },
          resumeProfile: {
            create: {
              gender: s(rec["性別"]),
              country: normalizeNationality(rec["国籍"]),
              visaType: normalizeResidenceStatus(rec["在留資格"]),
              visaExpiryDate: dStr(rec["ビザ期限"]),
              japaneseLevel: s(rec["日本語レベル"]),
              traineeExperience: s(rec["実習経験有無"]),
              preferenceNote: s(rec["現職の手取り額"]) ? `現職の手取り額: ${s(rec["現職の手取り額"])}` : null,
              remarks: s(rec["分野"]) ? `分野: ${s(rec["分野"])}` : null,
            },
          },
        },
      });
      console.log(`  ✅ 作成 ID=${idNum} ${name} (英: ${englishName ?? "-"}, パートナー: ${partnerId ?? "?"})`);
    }
    created++;
    createdPeople.push({ id: idNum, name });
  }

  console.log(`\n  作成 ${created} 件 / 既存スキップ ${skippedExist} 件`);

  // ===== 2. 履歴書収集フォーム から写真とその他フィールドをマージ =====
  console.log("\n== 履歴書収集フォーム マージ (作成した新規候補者のみ対象) ==");
  let mergedPhoto = 0;
  let mergedNoPhoto = 0;
  const noMatch: { id: number; name: string }[] = [];
  const matchLogs: { id: number; name: string; formKana: string; stage: string; score: number; photo: boolean }[] = [];

  // 効率化: 各フォーム行に対して、createdPeople 内で最良マッチを探す
  // ただし 1 人の DB candidate が複数のフォーム行に一致するのを避けるため、
  // 一度マッチしたら使い済みにする
  const usedCandidateIds = new Set<number>();
  // まず exact match を優先するため、フォーム行を 2 周してマッチング
  // 1 週目: exact のみ
  // 2 週目: normalized / fuzzy
  for (const formRec of formRecords) {
    const formKana = s(formRec["カタカナ名"])!;
    const available = createdPeople.filter((c) => !usedCandidateIds.has(c.id));
    if (available.length === 0) break;

    const result = findBestMatch(formKana, available);
    if (!result) continue;
    // exact は即採用
    if (result.stage !== "exact") continue;

    usedCandidateIds.add(result.match.id);
    await applyFormMerge(result.match, formRec, result.stage, result.score);
  }
  // 2 週目: 残った created と 残った form の組
  for (const formRec of formRecords) {
    const formKana = s(formRec["カタカナ名"])!;
    const available = createdPeople.filter((c) => !usedCandidateIds.has(c.id));
    if (available.length === 0) break;

    const result = findBestMatch(formKana, available);
    if (!result) continue;
    if (result.stage === "exact") continue; // 1 週目で処理済

    usedCandidateIds.add(result.match.id);
    await applyFormMerge(result.match, formRec, result.stage, result.score);
  }

  // どのフォーム行ともマッチしなかった新規候補者
  for (const person of createdPeople) {
    if (!usedCandidateIds.has(person.id)) {
      noMatch.push(person);
    }
  }

  async function applyFormMerge(
    person: { id: number; name: string },
    rec: Record<string, unknown>,
    stage: string,
    score: number
  ) {
    const formKana = s(rec["カタカナ名"])!;
    const photoRaw = s(rec["顔写真"]);
    // Drive の生 URL (open?id=XXX) は <img> から読めないので、サムネ URL に変換
    const photo = toDriveThumbUrl(photoRaw);
    matchLogs.push({ id: person.id, name: person.name, formKana, stage, score, photo: !!photo });

    if (DRY_RUN) {
      console.log(`  [DRY] マージ ID=${person.id} (${person.name}) ← form「${formKana}」 [${stage} ${(score * 100).toFixed(0)}%] 写真=${photo ? "あり" : "無し"}`);
      if (photo) mergedPhoto++;
      else mergedNoPhoto++;
      return;
    }

    // Person 本体: 写真 / メール / フォルダ
    // 設計方針: ここでは「新規作成した person」だけが対象なので、
    //   - photoUrl は null から始まっている = ?? は意味あるが、安全策で || undefined を使う
    //   - 既存があれば変えない (今回は新規なのでフィールドはまだ null)
    await prisma.person.update({
      where: { id: person.id },
      data: {
        photoUrl: photo || undefined,
        email: s(rec["メール"]) || undefined,
        driveFolderUrl: s(rec["応募者フォルダURL"]) || undefined,
      },
    });

    // 職歴 (会社 1-4)
    const workExperiences: { companyName: string; startDate: string; endDate: string; reason: string }[] = [];
    for (let n = 1; n <= 4; n++) {
      const companyName = s(rec[`会社名${n}`]);
      if (!companyName) continue;
      workExperiences.push({
        companyName,
        startDate: dStr(rec[`入社${n}`]) ?? "",
        endDate: dStr(rec[`退社${n}`]) ?? "",
        reason: "",
      });
    }

    // onboarding
    const englishName = s(rec["英語名"]);
    await prisma.personOnboarding.update({
      where: { personId: person.id },
      data: {
        englishName: englishName || undefined,
        phoneNumber: s(rec["電話"]) || undefined,
        address: s(rec["現住所"]) || undefined,
        postalCode: s(rec["郵便番号"]) || undefined,
      },
    });

    // resumeProfile
    await prisma.resumeProfile.update({
      where: { personId: person.id },
      data: {
        spouseStatus: s(rec["配偶者"]) || undefined,
        childrenCount: s(rec["子供"]) || undefined,
        highSchoolName: s(rec["高校名"]) || undefined,
        highSchoolStartDate: dStr(rec["入学"]) || undefined,
        highSchoolEndDate: dStr(rec["卒業"]) || undefined,
        licenseName: s(rec["免許"]) || undefined,
        licenseExpiryDate: dStr(rec["免許年"]) || undefined,
        otherQualificationName: s(rec["資格1"]) || undefined,
        otherQualificationExpiryDate: dStr(rec["資格年1"]) || undefined,
        motivation: s(rec["志望動機"]) || undefined,
        selfIntroduction: s(rec["自己紹介"]) || undefined,
        japanPurpose: s(rec["来日目的"]) || undefined,
        currentJob: s(rec["現在の仕事"]) || undefined,
        retirementReason: s(rec["退職理由"]) || undefined,
        workExperiences: workExperiences.length > 0 ? workExperiences : undefined,
      },
    });

    console.log(`  ✅ マージ ID=${person.id} (${person.name}) ← form「${formKana}」 [${stage} ${(score * 100).toFixed(0)}%] 写真=${photo ? "あり" : "無し"}`);
    if (photo) mergedPhoto++;
    else mergedNoPhoto++;
  }

  // ===== 3. ID シーケンス同期 =====
  if (!DRY_RUN && created > 0) {
    console.log("\n== ID シーケンス同期 ==");
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval('"Person_id_seq"', COALESCE((SELECT MAX(id) FROM "Person"), 0) + 1, false)`
      );
      console.log("  Person_id_seq を MAX(id)+1 に再設定");
    } catch (e) {
      console.warn("  シーケンス同期失敗:", e);
    }
  }

  // ===== 4. サマリー =====
  console.log("\n============================================");
  console.log("📊 サマリー");
  console.log("============================================");
  console.log(`✅ 新規作成: ${created} 件`);
  console.log(`⏭  既存スキップ: ${skippedExist} 件 (既存データは温存)`);
  console.log(`📸 写真マージ成功: ${mergedPhoto} 件`);
  console.log(`📷 フォームに写真なし: ${mergedNoPhoto} 件`);
  console.log(`❓ フォームとマッチしなかった新規: ${noMatch.length} 件`);
  if (noMatch.length > 0) {
    console.log("   ↓ 手動で写真を貼り付ける必要あり (フォーム内に該当カナ名が無いか、類似度 90% 未満):");
    for (const p of noMatch) {
      console.log(`     - ID=${p.id} ${p.name}`);
    }
  }
  if (duplicates.length > 0) {
    console.log(`⚠️  xlsx 内 ID 重複: ${duplicates.length} 件 (1 件目のみ採用)`);
  }
  // 名前マッチが fuzzy だったケースは確認のため表示
  const fuzzyMatches = matchLogs.filter((m) => m.stage === "fuzzy");
  if (fuzzyMatches.length > 0) {
    console.log(`\n⚠️  ファジーマッチ ${fuzzyMatches.length} 件 (要目視確認):`);
    for (const m of fuzzyMatches) {
      console.log(`     ID=${m.id} DB「${m.name}」 ← form「${m.formKana}」 (類似度 ${(m.score * 100).toFixed(1)}%)`);
    }
  }
  console.log("\n" + (DRY_RUN ? "🔍 DRY RUN モード — DB に書き込みなし" : "✅ 本実行完了"));
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
