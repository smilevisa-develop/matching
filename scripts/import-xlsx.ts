import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { parseFlexibleDate } from "../lib/flexible-date";

const CANDIDATE_FILE = process.env.CANDIDATE_XLSX || `${process.env.HOME}/Downloads/候補者データベース.xlsx`;
const COMPANY_FILE = process.env.COMPANY_XLSX || `${process.env.HOME}/Downloads/企業データベース.xlsx`;

const connectionString = getDatabaseUrl();
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ---------- util ----------
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
  // 1) Date インスタンス / ISO 文字列ならそのまま
  const date = d(value);
  if (date) return date.toISOString().slice(0, 10);
  // 2) 「2018年5月」「現在に至る」「2014 năm 08 tháng」等の柔軟パース
  const r = parseFlexibleDate(value);
  if (r && r.type === "iso") return r.value;
  if (r && r.type === "current") return null; // 「現在」は日付化せず空に
  // 3) パース不能はそのまま (元実装と同じく文字列保存)
  return s(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function numStr(value: unknown): string | null {
  const n = num(value);
  return n === null ? s(value) : String(Math.round(n));
}

function normalizeChannel(value: unknown): string {
  const v = s(value) ?? "";
  if (v.includes("LINE") || v === "LINE") return "LINE";
  if (v.includes("Messenger")) return "Messenger";
  if (v.includes("WhatsApp")) return "WhatsApp";
  if (v.includes("メール") || v.toLowerCase().includes("mail")) return "mail";
  return "LINE";
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
  return v;
}

async function resolveStaffByName(name: string | null): Promise<number | null> {
  if (!name) return null;
  // 表記ゆれ吸収
  const needle = name.trim();
  const account = await prisma.staffAccount.findFirst({
    where: {
      OR: [
        { name: needle },
        { loginId: needle.toLowerCase() },
        { name: { contains: needle } },
      ],
    },
  });
  return account?.id ?? null;
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

// ---------- readers ----------
function readSheet(filePath: string, sheetName: string): unknown[][] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

function rowToRecord(headers: (string | null)[], row: unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (h) record[h.replace(/\s+/g, "").replace(/\n/g, "")] = row[i] ?? null;
  });
  return record;
}

// ---------- main ----------
async function main() {
  const companyIdMap = new Map<string, number>();
  const personIdMap = new Map<string, number>(); // 候補者ID(文字列) → DB id
  const dealIdMap = new Map<string, number>();

  // ---- 1. 企業マスタ ----
  console.log("\n== 企業マスタ ==");
  {
    const rows = readSheet(COMPANY_FILE, "企業マスタ");
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalId = s(rec["企業ID"]);
      const name = s(rec["企業名"]);
      if (!externalId || !name) continue;
      const notes = [
        rec["担当者"] && `担当者: ${rec["担当者"]}`,
        rec["支援方法"] && `支援方法: ${rec["支援方法"]}`,
        rec["メール"] && `メール: ${rec["メール"]}`,
        rec["電話"] && `電話: ${rec["電話"]}`,
        rec["請求先"] && `請求先: ${rec["請求先"]}`,
        rec["支払条件"] && `支払条件: ${rec["支払条件"]}`,
        rec["契約条件"] && `契約条件: ${rec["契約条件"]}`,
        rec["備考"] && `備考: ${rec["備考"]}`,
      ].filter(Boolean).join("\n") || null;

      const company = await prisma.company.create({
        data: {
          externalId,
          name,
          industry: s(rec["分野"]),
          notes,
        },
      });
      companyIdMap.set(externalId, company.id);
      imported++;
    }
    console.log(`  作成 ${imported} 件`);
  }

  // ---- 2. 候補者 DB ----
  console.log("\n== 候補者 DB ==");
  {
    const rows = readSheet(CANDIDATE_FILE, "DB");
    // R1 はタイトル、R2 がヘッダー、R3 以降がデータ
    const headerRow = (rows[1] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 2; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalId = s(rec["ID"]);
      const name = s(rec["カタカナ名"]) || s(rec["候補者名"]);
      if (!externalId || !name) continue;
      const englishName = s(rec["候補者名"]);
      const partnerId = await resolvePartnerByName(s(rec["パートナー"]));
      const addressParts = [s(rec["都道府県"]), s(rec["現住所"])].filter(Boolean);
      const address = addressParts.join(" ") || null;

      const explicitId = Number(externalId);
      const person = await prisma.person.create({
        data: {
          ...(Number.isFinite(explicitId) && explicitId > 0 ? { id: explicitId } : {}),
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
      personIdMap.set(externalId, person.id);
      imported++;
    }
    console.log(`  作成 ${imported} 件`);
  }

  // ---- 3. 履歴書収集フォーム (カタカナ名でマッチ) ----
  console.log("\n== 履歴書収集フォーム マージ ==");
  {
    const rows = readSheet(CANDIDATE_FILE, "履歴書収集フォーム");
    // R1 がヘッダー、R2 は質問文 (スキップ)、R3 以降データ
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let merged = 0;
    for (let i = 2; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const kana = s(rec["カタカナ名"]);
      if (!kana) continue;
      const person = await prisma.person.findFirst({ where: { name: { contains: kana.slice(0, 3) } } });
      if (!person) continue;

      // 職歴を組み立て
      const workExperiences = [];
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
      merged++;
    }
    console.log(`  マージ ${merged} 件`);
  }

  // ---- 4. 案件管理 ----
  console.log("\n== 案件管理 ==");
  {
    const rows = readSheet(COMPANY_FILE, "案件管理");
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalId = s(rec["案件ID"]);
      const externalCompanyId = s(rec["企業ID"]);
      const title = s(rec["案件名"]);
      if (!externalId || !title) continue;
      const companyId = externalCompanyId ? companyIdMap.get(externalCompanyId) : null;
      if (!companyId) {
        console.log(`  スキップ: 企業ID=${externalCompanyId} が見つからない (${title})`);
        continue;
      }
      const ownerId = await resolveStaffByName(s(rec["担当者"]));
      const explicitDealId = Number(externalId);
      const deal = await prisma.deal.create({
        data: {
          ...(Number.isFinite(explicitDealId) && explicitDealId > 0 ? { id: explicitDealId } : {}),
          title,
          companyId,
          ownerId,
          field: s(rec["職種"]),
          status: s(rec["ステータス"]) ?? "募集中",
          acceptedAt: d(rec["受注日"]),
          unitPrice: numStr(rec["単価"]),
          requiredCount: num(rec["募集人数"]) ?? 0,
          recommendedCount: num(rec["推薦人数"]) ?? 0,
          interviewCount: num(rec["面接人数"]) ?? 0,
          offerCount: num(rec["内定人数"]) ?? 0,
          contractCount: num(rec["成約人数"]) ?? 0,
          // 流入/入社状況 は候補者ごとに異なるので案件メモには含めない
          notes: null,
        },
      });
      dealIdMap.set(externalId, deal.id);
      imported++;
    }
    console.log(`  作成 ${imported} 件`);
  }

  // ---- 5. 条件マスタ → JobPosting ----
  console.log("\n== 条件マスタ ==");
  {
    const rows = readSheet(COMPANY_FILE, "条件マスタ");
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalDealId = s(rec["案件ID"]);
      if (!externalDealId) continue;
      const dealId = dealIdMap.get(externalDealId);
      if (!dealId) continue;
      const title = s(rec["求人名"]) ?? s(rec["求人票"]) ?? "求人票";

      await prisma.jobPosting.create({
        data: {
          dealId,
          title,
          documentUrl: s(rec["求人票"]),
          status: "draft",
          jobDescription: s(rec["仕事内容"]),
          workLocation: s(rec["勤務地"]) ?? s(rec["勤務地住所"]),
          nearestStation: s(rec["最寄り駅"]),
          headcount: s(rec["募集人数"]),
          gender: s(rec["性別"]),
          nationality: s(rec["国籍"]),
          workTime1Start: s(rec["勤務時間1開始"]),
          workTime1End: s(rec["勤務時間1終了"]),
          workTime2Start: s(rec["勤務時間2開始"]),
          workTime2End: s(rec["勤務時間2終了"]),
          overtime: s(rec["残業有無"]),
          avgMonthlyOvertime: numStr(rec["月間平均残業時間"]),
          fixedOvertimeHours: numStr(rec["固定残業時間"]),
          fixedOvertimePay: numStr(rec["固定残業代"]),
          monthlyGross: numStr(rec["月総支給額"]),
          basicSalary: numStr(rec["基本給"]),
          salaryCalcMethod: s(rec["給与計算方法"]),
          perfectAttendance: numStr(rec["皆勤手当"]),
          housingAllowance: numStr(rec["住宅手当"]),
          nightShiftAllowance: numStr(rec["深夜手当"]),
          commuteAllowance: numStr(rec["通勤手当"]),
          socialInsurance: numStr(rec["社会保険料"]),
          employmentInsurance: numStr(rec["雇用保険料"]),
          healthInsurance: numStr(rec["健康保険料"]),
          pensionInsurance: numStr(rec["厚生年金保険料"]),
          incomeTax: numStr(rec["所得税"]),
          residentTax: numStr(rec["住民税"]),
          mealProvision: s(rec["食費支給有無"]),
          mealAmount: numStr(rec["食費金額"]),
          dormProvision: s(rec["寮費有無"]) ?? s(rec["寮有無"]),
          dormAmount: numStr(rec["寮費金額"]) ?? numStr(rec["寮費"]),
          utilitiesProvision: s(rec["光熱費有無"]),
          utilitiesAmount: numStr(rec["光熱費金額"]),
          holidays: s(rec["休日詳細"]),
          otherBenefits: s(rec["福利厚生"]),
          notes: s(rec["特記事項"]),
        },
      });
      imported++;
    }
    console.log(`  作成 ${imported} 件`);
  }

  // ---- 6. 請求管理 → Invoice + Placement 初期値 ----
  console.log("\n== 請求管理 ==");
  {
    const rows = readSheet(COMPANY_FILE, "請求管理");
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalPersonId = s(rec["候補者ID"]);
      const personId = externalPersonId ? personIdMap.get(externalPersonId) : null;
      if (!personId) continue;
      const externalDealId = s(rec["案件ID"]);
      const dealId = externalDealId ? dealIdMap.get(externalDealId) ?? null : null;
      const partnerId = await resolvePartnerByName(s(rec["パートナー"]));

      const channel = s(rec["自社orPA"])?.includes("パートナー") ? "PA" : "自社";

      await prisma.invoice.create({
        data: {
          personId,
          dealId,
          unitPrice: numStr(rec["単価"]),
          invoiceDate: d(rec["請求日"]),
          invoiceAmount: numStr(rec["請求金額"]),
          invoiceNumber: s(rec["請求書"]),
          invoiceStatus: s(rec["請求ステータス"]) ?? "未送付",
          invoiceUrl: s(rec["請求書リンク"]),
          channel,
          partnerId,
          costAmount: numStr(rec["仕入高"]),
          paInvoiceUrl: s(rec["PAからの請求書"]),
          paPaid: s(rec["支払い有無"])?.includes("済") ?? false,
          paPaidAt: d(rec["支払日"]),
          notes: s(rec["備考"]),
        },
      });

      // Placement 初期値 (Invoice シート上の日程)
      await prisma.personPlacement.upsert({
        where: { personId },
        create: {
          personId,
          acceptedAt: d(rec["案件受付日"]),
          preInterviewAt: d(rec["事前面談日"]),
          companyInterviewAt: d(rec["企業面談日"]),
          offerAt: d(rec["内定日"]),
          offerAcceptedAt: d(rec["内定承諾日"]),
          applicationAt: d(rec["申請日"]),
          joinPlannedAt: d(rec["入社予定日"]),
          joinAt: d(rec["入社日"]),
          returnHomeFlag: s(rec["一時帰国"]),
          entryPlannedAt: d(rec["入国予定"]),
        },
        update: {
          acceptedAt: d(rec["案件受付日"]) ?? undefined,
          preInterviewAt: d(rec["事前面談日"]) ?? undefined,
          companyInterviewAt: d(rec["企業面談日"]) ?? undefined,
          offerAt: d(rec["内定日"]) ?? undefined,
          offerAcceptedAt: d(rec["内定承諾日"]) ?? undefined,
          applicationAt: d(rec["申請日"]) ?? undefined,
          joinPlannedAt: d(rec["入社予定日"]) ?? undefined,
          joinAt: d(rec["入社日"]) ?? undefined,
          returnHomeFlag: s(rec["一時帰国"]) ?? undefined,
          entryPlannedAt: d(rec["入国予定"]) ?? undefined,
        },
      });
      imported++;
    }
    console.log(`  作成 Invoice ${imported} 件`);
  }

  // ---- 7. 内定者管理 → Placement 上書き ----
  console.log("\n== 内定者管理 ==");
  {
    const rows = readSheet(COMPANY_FILE, "内定者管理");
    const headerRow = (rows[0] ?? []) as unknown[];
    const headers = headerRow.map((h) => (h ? String(h).replace(/\s+/g, "").replace(/\n/g, "") : null));
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const rec = rowToRecord(headers, rows[i]);
      const externalPersonId = s(rec["候補者ID"]);
      const personId = externalPersonId ? personIdMap.get(externalPersonId) : null;
      if (!personId) continue;

      await prisma.personPlacement.upsert({
        where: { personId },
        create: {
          personId,
          applicationType: s(rec["申請種別"]),
          applicantName: s(rec["申請者"]),
          offerAt: d(rec["内定日"]),
          applicationPlannedAt: d(rec["申請予定日"]),
          applicationAt: d(rec["申請日"]),
          applicationResultAt: d(rec["申請結果受け取り"]),
          returnHomeAt: d(rec["一時帰国日"]),
          entryAt: d(rec["入国日"]),
          joinPlannedAt: d(rec["入社予定日"]),
          joinAt: d(rec["入社日"]),
          sixMonthStatus: s(rec["6か月後の状況"]),
          consultation: s(rec["相談したいこと"]),
          currentAction: s(rec["現在の対応内容"]),
        },
        update: {
          applicationType: s(rec["申請種別"]) ?? undefined,
          applicantName: s(rec["申請者"]) ?? undefined,
          offerAt: d(rec["内定日"]) ?? undefined,
          applicationPlannedAt: d(rec["申請予定日"]) ?? undefined,
          applicationAt: d(rec["申請日"]) ?? undefined,
          applicationResultAt: d(rec["申請結果受け取り"]) ?? undefined,
          returnHomeAt: d(rec["一時帰国日"]) ?? undefined,
          entryAt: d(rec["入国日"]) ?? undefined,
          joinPlannedAt: d(rec["入社予定日"]) ?? undefined,
          joinAt: d(rec["入社日"]) ?? undefined,
          sixMonthStatus: s(rec["6か月後の状況"]) ?? undefined,
          consultation: s(rec["相談したいこと"]) ?? undefined,
          currentAction: s(rec["現在の対応内容"]) ?? undefined,
        },
      });
      imported++;
    }
    console.log(`  更新 ${imported} 件`);
  }

  // 明示ID挿入後、自動採番のシーケンスを MAX(id)+1 に同期
  console.log("\n== ID シーケンス同期 ==");
  for (const table of ["Person", "Deal", "Company", "Partner", "Invoice", "JobPosting", "PersonPlacement"]) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval('"${table}_id_seq"', COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`
      );
    } catch {
      // シーケンスが無ければスキップ
    }
  }

  console.log("\n✅ インポート完了");
  console.log("  Companies:", companyIdMap.size);
  console.log("  Persons:", personIdMap.size);
  console.log("  Deals:", dealIdMap.size);
}

main()
  .catch((error) => {
    console.error("❌ エラー:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
