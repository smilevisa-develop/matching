/**
 * 候補者データベース.xlsx の DB シート + 履歴書収集フォームシートを読み、
 * 既存 Person の **欠損フィールドだけ** を埋めつつ、未登録の ID は新規作成する
 * 一括同期スクリプト。
 *
 *   - 既に値が入っているフィールドは上書きしない (手動編集を尊重)
 *     "不明" / "技能実習" (デフォルト値) / "LINE" / "未設定" などのプレースホルダは
 *     未入力扱いとして上書き許可
 *   - 日付は parseFlexibleDate を通して ISO 化
 *   - 連絡手段の既定値は "未設定"
 *
 * 使い方:
 *   FROM_ID=1 TO_ID=125 npx tsx scripts/sync-all-from-xlsx.ts
 *   OVERWRITE=1 を付けると、空でない既存値も DB シート / フォーム値で上書き (危険)
 *   FILE=/path/to.xlsx で xlsx パス指定可 (既定: ~/Downloads/候補者データベース.xlsx)
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { parseFlexibleDate } from "../lib/flexible-date";

const FROM_ID = Number(process.env.FROM_ID ?? 1);
const TO_ID = Number(process.env.TO_ID ?? 125);
const FILE = process.env.FILE || `${process.env.HOME}/Downloads/候補者データベース.xlsx`;
const OVERWRITE = process.env.OVERWRITE === "1";
// 履歴書フォーム由来のフィールドだけ強制的に書き換えたい場合のフラグ
// (前回 prefix マッチでクロスポリュート (混入) が起きた場合のリカバリ用)
const OVERWRITE_FORM = process.env.OVERWRITE_FORM === "1" || OVERWRITE;

const cs = getDatabaseUrl();
if (!cs) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });

// ---------- util ----------
function s(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function dStr(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
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

// プレースホルダ判定 (上書きしてよい "空" 扱い)
const NATIONALITY_PLACEHOLDERS = new Set(["", "不明", "その他", "未設定", "?"]);
const RESIDENCE_PLACEHOLDERS = new Set(["", "技能実習", "未設定", "?"]);
const CHANNEL_PLACEHOLDERS = new Set(["", "LINE", "未設定"]);

function isEffectivelyEmpty(field: string, current: unknown): boolean {
  if (current === null || current === undefined) return true;
  if (typeof current !== "string") return false;
  const trimmed = current.trim();
  if (trimmed === "") return true;
  if (field === "nationality") return NATIONALITY_PLACEHOLDERS.has(trimmed);
  if (field === "residenceStatus") return RESIDENCE_PLACEHOLDERS.has(trimmed);
  if (field === "channel") return CHANNEL_PLACEHOLDERS.has(trimmed);
  return false;
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

// 値が空 (or プレースホルダ) なら新値を採用、そうでなければ既存値維持
function pick<T>(
  field: string,
  current: T | null | undefined,
  incoming: T | null | undefined,
  forceOverwrite = false
): T | null {
  if (incoming === null || incoming === undefined) return (current ?? null) as T | null;
  if (typeof incoming === "string" && incoming.trim() === "") return (current ?? null) as T | null;
  if (OVERWRITE || forceOverwrite) return incoming as T;
  if (isEffectivelyEmpty(field, current)) return incoming as T;
  return (current ?? null) as T | null;
}

type Stats = {
  created: number;
  updated: number;
  unchanged: number;
  formMerged: number;
};

async function main() {
  console.log(`== 同期 ID ${FROM_ID}〜${TO_ID} from ${FILE} ${OVERWRITE ? "(OVERWRITE)" : "(空欄のみ補完)"} ==`);
  const stats: Stats = { created: 0, updated: 0, unchanged: 0, formMerged: 0 };

  // ---- DB シート ----
  const dbRows = readSheet(FILE, "DB");
  const dbHeaderRow = (dbRows[1] ?? []) as unknown[];
  const dbHeaders = dbHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));

  // ID → DB シート行 のマップ
  const dbById = new Map<number, Record<string, unknown>>();
  for (let i = 2; i < dbRows.length; i++) {
    const rec = rowToRecord(dbHeaders, dbRows[i]);
    const idStr = s(rec["ID"]);
    if (!idStr) continue;
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < FROM_ID || idNum > TO_ID) continue;
    dbById.set(idNum, rec);
  }
  console.log(`  DB シート対象行: ${dbById.size} 件`);

  // ---- 各 ID を処理 ----
  for (const [idNum, rec] of [...dbById.entries()].sort((a, b) => a[0] - b[0])) {
    const name = s(rec["カタカナ名"]) || s(rec["候補者名"]);
    if (!name) continue;

    const exists = await prisma.person.findUnique({
      where: { id: idNum },
      include: { onboarding: true, resumeProfile: true },
    });

    const englishName = s(rec["候補者名"]);
    const partnerId = await resolvePartnerByName(s(rec["パートナー"]));
    const addressParts = [s(rec["都道府県"]), s(rec["現住所"])].filter(Boolean);
    const xlsxAddress = addressParts.join(" ") || null;
    const xlsxNationality = normalizeNationality(rec["国籍"]);
    const xlsxResidence = normalizeResidenceStatus(rec["在留資格"]);
    const xlsxBirth = dStr(rec["生年月日"]);
    const xlsxPostal = s(rec["郵便番号"]);
    const xlsxVisaExpiry = dStr(rec["ビザ期限"]);
    const xlsxJapaneseLevel = s(rec["日本語レベル"]);
    const xlsxTrainee = s(rec["実習経験有無"]);
    const xlsxDriveFolder = s(rec["書類フォルダリンク"]);
    const xlsxField = s(rec["分野"]);
    const xlsxGender = s(rec["性別"]);
    const xlsxPreferenceNote = s(rec["現職の手取り額"]) ? `現職の手取り額: ${s(rec["現職の手取り額"])}` : null;

    if (!exists) {
      // 新規作成
      await prisma.person.create({
        data: {
          id: idNum,
          name,
          nationality: xlsxNationality,
          residenceStatus: xlsxResidence,
          channel: "未設定",
          partnerId,
          driveFolderUrl: xlsxDriveFolder,
          onboarding: {
            create: {
              englishName,
              birthDate: xlsxBirth,
              address: xlsxAddress,
              postalCode: xlsxPostal,
              status: "submitted",
            },
          },
          resumeProfile: {
            create: {
              gender: xlsxGender,
              country: xlsxNationality,
              visaType: xlsxResidence,
              visaExpiryDate: xlsxVisaExpiry,
              japaneseLevel: xlsxJapaneseLevel,
              traineeExperience: xlsxTrainee,
              preferenceNote: xlsxPreferenceNote,
              remarks: xlsxField ? `分野: ${xlsxField}` : null,
            },
          },
        },
      });
      console.log(`  作成 ID=${idNum} ${name} (${englishName ?? "-"})`);
      stats.created++;
      continue;
    }

    // 既存: 空欄/プレースホルダのみ補完
    const personPatch: Record<string, unknown> = {};
    const newName = pick("name", exists.name, name);
    if (newName !== exists.name) personPatch.name = newName;

    const newNat = pick("nationality", exists.nationality, xlsxNationality);
    if (newNat !== exists.nationality) personPatch.nationality = newNat;

    const newRes = pick("residenceStatus", exists.residenceStatus, xlsxResidence);
    if (newRes !== exists.residenceStatus) personPatch.residenceStatus = newRes;

    const newPartnerId = partnerId !== null && (OVERWRITE || exists.partnerId === null) ? partnerId : exists.partnerId;
    if (newPartnerId !== exists.partnerId) personPatch.partnerId = newPartnerId;

    const newDrive = pick("driveFolderUrl", exists.driveFolderUrl, xlsxDriveFolder);
    if (newDrive !== exists.driveFolderUrl) personPatch.driveFolderUrl = newDrive;

    let personDirty = Object.keys(personPatch).length > 0;
    if (personDirty) {
      await prisma.person.update({ where: { id: idNum }, data: personPatch });
    }

    // Onboarding
    if (!exists.onboarding) {
      await prisma.personOnboarding.create({
        data: {
          personId: idNum,
          englishName,
          birthDate: xlsxBirth,
          address: xlsxAddress,
          postalCode: xlsxPostal,
          status: "submitted",
        },
      });
      personDirty = true;
    } else {
      const onbPatch: Record<string, unknown> = {};
      const newEn = pick("englishName", exists.onboarding.englishName, englishName);
      if (newEn !== exists.onboarding.englishName) onbPatch.englishName = newEn;
      const newBirth = pick("birthDate", exists.onboarding.birthDate, xlsxBirth);
      if (newBirth !== exists.onboarding.birthDate) onbPatch.birthDate = newBirth;
      const newAddr = pick("address", exists.onboarding.address, xlsxAddress);
      if (newAddr !== exists.onboarding.address) onbPatch.address = newAddr;
      const newPostal = pick("postalCode", exists.onboarding.postalCode, xlsxPostal);
      if (newPostal !== exists.onboarding.postalCode) onbPatch.postalCode = newPostal;
      if (Object.keys(onbPatch).length > 0) {
        await prisma.personOnboarding.update({ where: { personId: idNum }, data: onbPatch });
        personDirty = true;
      }
    }

    // ResumeProfile
    if (!exists.resumeProfile) {
      await prisma.resumeProfile.create({
        data: {
          personId: idNum,
          gender: xlsxGender,
          country: xlsxNationality,
          visaType: xlsxResidence,
          visaExpiryDate: xlsxVisaExpiry,
          japaneseLevel: xlsxJapaneseLevel,
          traineeExperience: xlsxTrainee,
          preferenceNote: xlsxPreferenceNote,
          remarks: xlsxField ? `分野: ${xlsxField}` : null,
        },
      });
      personDirty = true;
    } else {
      const rpPatch: Record<string, unknown> = {};
      const newGender = pick("gender", exists.resumeProfile.gender, xlsxGender);
      if (newGender !== exists.resumeProfile.gender) rpPatch.gender = newGender;
      const newCountry = pick("country", exists.resumeProfile.country, xlsxNationality);
      if (newCountry !== exists.resumeProfile.country) rpPatch.country = newCountry;
      const newVisaType = pick("visaType", exists.resumeProfile.visaType, xlsxResidence);
      if (newVisaType !== exists.resumeProfile.visaType) rpPatch.visaType = newVisaType;
      const newVisaExp = pick("visaExpiryDate", exists.resumeProfile.visaExpiryDate, xlsxVisaExpiry);
      if (newVisaExp !== exists.resumeProfile.visaExpiryDate) rpPatch.visaExpiryDate = newVisaExp;
      const newJp = pick("japaneseLevel", exists.resumeProfile.japaneseLevel, xlsxJapaneseLevel);
      if (newJp !== exists.resumeProfile.japaneseLevel) rpPatch.japaneseLevel = newJp;
      const newTrainee = pick("traineeExperience", exists.resumeProfile.traineeExperience, xlsxTrainee);
      if (newTrainee !== exists.resumeProfile.traineeExperience) rpPatch.traineeExperience = newTrainee;
      const newRemarks = pick("remarks", exists.resumeProfile.remarks, xlsxField ? `分野: ${xlsxField}` : null);
      if (newRemarks !== exists.resumeProfile.remarks) rpPatch.remarks = newRemarks;
      if (Object.keys(rpPatch).length > 0) {
        await prisma.resumeProfile.update({ where: { personId: idNum }, data: rpPatch });
        personDirty = true;
      }
    }

    if (personDirty) {
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }

  console.log(`  DB sheet 反映: 作成 ${stats.created} / 更新 ${stats.updated} / 変更なし ${stats.unchanged}`);

  // ---- 履歴書収集フォーム マージ (FROM_ID〜TO_ID 全員) ----
  console.log("\n== 履歴書収集フォーム マージ ==");
  const formRows = readSheet(FILE, "履歴書収集フォーム");
  const formHeaderRow = (formRows[0] ?? []) as unknown[];
  const formHeaders = formHeaderRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));

  // 範囲内の Person を全件先読みして strict マッチ用の index を作る
  const personsInRange = await prisma.person.findMany({
    where: { id: { gte: FROM_ID, lte: TO_ID } },
    include: { onboarding: true, resumeProfile: true },
  });
  const normalize = (str: string) => str.replace(/[\s　・·•\-‐－―=＝]/g, "").toUpperCase();
  const byEnglish = new Map<string, (typeof personsInRange)[number]>();
  const byKana = new Map<string, (typeof personsInRange)[number]>();
  for (const p of personsInRange) {
    if (p.onboarding?.englishName) byEnglish.set(normalize(p.onboarding.englishName), p);
    byKana.set(normalize(p.name), p);
  }

  let unmatched = 0;
  for (let i = 2; i < formRows.length; i++) {
    const rec = rowToRecord(formHeaders, formRows[i]);
    const kana = s(rec["カタカナ名"]);
    const formEnglish = s(rec["英語名"]);
    if (!kana && !formEnglish) continue;

    // ① 英語名で厳密一致を優先 (一意性が高い)
    // ② 次にカタカナ名の正規化文字列で完全一致
    // ③ どちらも当たらない form 行はスキップ (誤マージ防止)
    const person =
      (formEnglish ? byEnglish.get(normalize(formEnglish)) : undefined) ??
      (kana ? byKana.get(normalize(kana)) : undefined);
    if (!person) {
      unmatched++;
      console.log(`  ⚠️  マッチなし form 行 i=${i} kana="${kana}" english="${formEnglish}"`);
      continue;
    }

    // 職歴 (4 件まで)
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

    const photoUrlIncoming = s(rec["顔写真"]);
    const emailIncoming = s(rec["メール"]);
    const driveIncoming = s(rec["応募者フォルダURL"]);
    const personPatch: Record<string, unknown> = {};
    // 注意: photoUrl はフォーム由来の raw URL (open?id=...) が <img> で描画できない一方、
    // backfill-photos で生成した thumbnail?id=... 形式は描画できる。
    // フォーム値で上書きすると画像が表示されなくなるので、photoUrl は **絶対に上書きしない**
    // (NULL のときだけ初期値として埋める)
    const newPhoto = pick("photoUrl", person.photoUrl, photoUrlIncoming, false);
    if (newPhoto !== person.photoUrl) personPatch.photoUrl = newPhoto;
    const newEmail = pick("email", person.email, emailIncoming, OVERWRITE_FORM);
    if (newEmail !== person.email) personPatch.email = newEmail;
    const newDrive = pick("driveFolderUrl", person.driveFolderUrl, driveIncoming, OVERWRITE_FORM);
    if (newDrive !== person.driveFolderUrl) personPatch.driveFolderUrl = newDrive;
    if (Object.keys(personPatch).length > 0) {
      await prisma.person.update({ where: { id: person.id }, data: personPatch });
    }

    const englishName = s(rec["英語名"]);
    const phoneNumberIncoming = s(rec["電話"]);
    const addressIncoming = s(rec["現住所"]);
    const postalIncoming = s(rec["郵便番号"]);
    if (person.onboarding) {
      const onbPatch: Record<string, unknown> = {};
      const newEn = pick("englishName", person.onboarding.englishName, englishName, OVERWRITE_FORM);
      if (newEn !== person.onboarding.englishName) onbPatch.englishName = newEn;
      const newPhone = pick("phoneNumber", person.onboarding.phoneNumber, phoneNumberIncoming, OVERWRITE_FORM);
      if (newPhone !== person.onboarding.phoneNumber) onbPatch.phoneNumber = newPhone;
      const newAddr = pick("address", person.onboarding.address, addressIncoming, OVERWRITE_FORM);
      if (newAddr !== person.onboarding.address) onbPatch.address = newAddr;
      const newPostal = pick("postalCode", person.onboarding.postalCode, postalIncoming, OVERWRITE_FORM);
      if (newPostal !== person.onboarding.postalCode) onbPatch.postalCode = newPostal;
      if (Object.keys(onbPatch).length > 0) {
        await prisma.personOnboarding.update({ where: { personId: person.id }, data: onbPatch });
      }
    }

    const formProfile = {
      spouseStatus: s(rec["配偶者"]),
      childrenCount: s(rec["子供"]),
      highSchoolName: s(rec["高校名"]),
      highSchoolStartDate: dStr(rec["入学"]),
      highSchoolEndDate: dStr(rec["卒業"]),
      licenseName: s(rec["免許"]),
      licenseExpiryDate: dStr(rec["免許年"]),
      otherQualificationName: s(rec["資格1"]),
      otherQualificationExpiryDate: dStr(rec["資格年1"]),
      motivation: s(rec["志望動機"]),
      selfIntroduction: s(rec["自己紹介"]),
      japanPurpose: s(rec["来日目的"]),
      currentJob: s(rec["現在の仕事"]),
      retirementReason: s(rec["退職理由"]),
    } as const;

    if (person.resumeProfile) {
      const rpPatch: Record<string, unknown> = {};
      for (const [k, incoming] of Object.entries(formProfile)) {
        const currentVal = (person.resumeProfile as unknown as Record<string, unknown>)[k];
        const next = pick(k, currentVal as string | null, incoming, OVERWRITE_FORM);
        if (next !== currentVal) rpPatch[k] = next;
      }
      // workExperiences: 既存が空配列なら埋める、OVERWRITE_FORM 時は丸ごと差し替え
      const currentWorks = Array.isArray(person.resumeProfile.workExperiences)
        ? (person.resumeProfile.workExperiences as unknown[])
        : [];
      if (workExperiences.length > 0 && (OVERWRITE_FORM || currentWorks.length === 0)) {
        rpPatch.workExperiences = workExperiences;
      }
      if (Object.keys(rpPatch).length > 0) {
        await prisma.resumeProfile.update({ where: { personId: person.id }, data: rpPatch });
      }
    }

    stats.formMerged++;
    console.log(
      `  マージ ID=${person.id} ${person.name} ← ${formEnglish ?? kana} (matched by ${formEnglish && byEnglish.has(normalize(formEnglish)) ? "英語名" : "カナ"})`
    );
  }
  console.log(`  フォーム未マッチ行: ${unmatched} 件`);

  // ---- ID シーケンス同期 ----
  console.log("\n== ID シーケンス同期 ==");
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval('"Person_id_seq"', COALESCE((SELECT MAX(id) FROM "Person"), 0) + 1, false)`
    );
    console.log("  Person_id_seq を MAX(id)+1 に再設定");
  } catch (e) {
    console.warn("  シーケンス同期失敗:", e);
  }

  console.log(
    `\n✅ 完了: 作成 ${stats.created} / 更新 ${stats.updated} / 変更なし ${stats.unchanged} / フォーム反映 ${stats.formMerged}`
  );
}

main()
  .catch((e) => {
    console.error("❌ エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
