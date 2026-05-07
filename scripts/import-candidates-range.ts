/**
 * 候補者データベース.xlsx から指定 ID 範囲の候補者だけを追加するスクリプト。
 *
 * 使い方:
 *   FROM_ID=101 TO_ID=110 npx tsx scripts/import-candidates-range.ts
 *
 *   既定値: FROM_ID=101, TO_ID=110
 *   FILE 環境変数で xlsx パスを上書き可能 (既定: ~/Downloads/候補者データベース.xlsx)
 *
 * 既に同じ ID が DB に存在する場合はスキップする。Person 自体は明示 ID で作成し、
 * onboarding / resumeProfile を同時 create、その後 履歴書収集フォーム のシートから
 * カナ名でマッチして上書きマージする。最後に id 連番を MAX(id)+1 に同期する。
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { parseFlexibleDate } from "../lib/flexible-date";

const FROM_ID = Number(process.env.FROM_ID ?? 101);
const TO_ID = Number(process.env.TO_ID ?? 110);
const FILE = process.env.FILE || `${process.env.HOME}/Downloads/候補者データベース.xlsx`;

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter });

// ---------- util (import-xlsx.ts と同等) ----------
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
  if (!v) return "特定技能1号";
  if (v.includes("技能実習")) return "技能実習";
  if (v.includes("特定技能1") || v.includes("特定技能一")) return "特定技能1号";
  if (v.includes("特定技能2") || v.includes("特定技能二")) return "特定技能2号";
  if (v.includes("技術") || v.includes("技人国")) return "技術・人文知識・国際業務";
  if (v.includes("留学")) return "留学生";
  if (v.includes("特定活動")) return "特定活動";
  return v;
}

async function resolvePartnerByName(name: string | null): Promise<number | null> {
  if (!name) return null;
  const needle = name.trim();
  let partner = await prisma.partner.findFirst({
    where: { OR: [{ name: needle }, { name: { contains: needle } }] },
  });
  if (!partner) {
    partner = await prisma.partner.create({ data: { name: needle } });
  }
  return partner.id;
}

function readSheet(filePath: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

function rowToRecord(headers: (string | null)[], row: unknown[]): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (h) rec[h.replace(/\s+/g, "").replace(/\n/g, "")] = row[i] ?? null;
  });
  return rec;
}

async function main() {
  console.log(`== 範囲 ID ${FROM_ID}〜${TO_ID} を ${FILE} から取り込み ==`);

  // ---- 1. DB シートから対象を作成 ----
  const dbRows = readSheet(FILE, "DB");
  const dbHeaderRow = (dbRows[1] ?? []) as unknown[];
  const dbHeaders = dbHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));

  let created = 0;
  let skipped = 0;
  const createdKanas: string[] = [];

  for (let i = 2; i < dbRows.length; i++) {
    const rec = rowToRecord(dbHeaders, dbRows[i]);
    const idStr = s(rec["ID"]);
    if (!idStr) continue;
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < FROM_ID || idNum > TO_ID) continue;

    const name = s(rec["カタカナ名"]) || s(rec["候補者名"]);
    if (!name) {
      console.log(`  スキップ ID=${idNum}: 名前が無い`);
      skipped++;
      continue;
    }

    const exists = await prisma.person.findUnique({ where: { id: idNum } });
    if (exists) {
      console.log(`  スキップ ID=${idNum}: 既に存在 (${exists.name})`);
      skipped++;
      continue;
    }

    const englishName = s(rec["候補者名"]);
    const partnerId = await resolvePartnerByName(s(rec["パートナー"]));
    const addressParts = [s(rec["都道府県"]), s(rec["現住所"])].filter(Boolean);
    const address = addressParts.join(" ") || null;

    const person = await prisma.person.create({
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
    console.log(`  作成 ID=${person.id} ${person.name} (${englishName ?? "-"})`);
    created++;
    if (s(rec["カタカナ名"])) createdKanas.push(s(rec["カタカナ名"])!);
  }
  console.log(`  作成 ${created} 件 / スキップ ${skipped} 件`);

  // ---- 2. 履歴書収集フォーム からマージ (作成した候補者だけ) ----
  if (createdKanas.length > 0) {
    console.log("\n== 履歴書収集フォーム マージ ==");
    const formRows = readSheet(FILE, "履歴書収集フォーム");
    const formHeaderRow = (formRows[0] ?? []) as unknown[];
    const formHeaders = formHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let merged = 0;

    for (let i = 2; i < formRows.length; i++) {
      const rec = rowToRecord(formHeaders, formRows[i]);
      const kana = s(rec["カタカナ名"]);
      if (!kana) continue;
      // 作成済みの候補者だけマージ対象
      const matched = createdKanas.some((k) => k.replace(/\s/g, "").startsWith(kana.replace(/\s/g, "").slice(0, 3)));
      if (!matched) continue;

      const person = await prisma.person.findFirst({
        where: { name: { contains: kana.slice(0, 3) }, id: { gte: FROM_ID, lte: TO_ID } },
      });
      if (!person) continue;

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

      await prisma.person.update({
        where: { id: person.id },
        data: {
          photoUrl: person.photoUrl ?? s(rec["顔写真"]),
          email: person.email ?? s(rec["メール"]),
          driveFolderUrl: person.driveFolderUrl ?? s(rec["応募者フォルダURL"]),
        },
      });

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
      console.log(`  マージ ID=${person.id} ${person.name}`);
      merged++;
    }
    console.log(`  マージ ${merged} 件`);
  }

  // ---- 3. ID シーケンス同期 ----
  console.log("\n== ID シーケンス同期 ==");
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval('"Person_id_seq"', COALESCE((SELECT MAX(id) FROM "Person"), 0) + 1, false)`
    );
    console.log("  Person_id_seq を MAX(id)+1 に再設定");
  } catch (e) {
    console.warn("  シーケンス同期失敗:", e);
  }

  console.log("\n✅ 完了");
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
