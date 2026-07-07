import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { createResumeDocumentFromTemplate, ensureCompanyDriveFolder } from "@/lib/google-docs";

type JobPostingFields = {
  title?: string;
  jobDescription?: string;
  workLocation?: string;
  nearestStation?: string;
  headcount?: string;
  gender?: string;
  nationality?: string;
  workTime1Start?: string;
  workTime1End?: string;
  workTime2Start?: string;
  workTime2End?: string;
  overtime?: string;
  avgMonthlyOvertime?: string;
  fixedOvertimeHours?: string;
  fixedOvertimePay?: string;
  monthlyGross?: string;
  basicSalary?: string;
  salaryCalcMethod?: string;
  perfectAttendance?: string;
  housingAllowance?: string;
  nightShiftAllowance?: string;
  commuteAllowance?: string;
  socialInsurance?: string;
  employmentInsurance?: string;
  healthInsurance?: string;
  pensionInsurance?: string;
  incomeTax?: string;
  residentTax?: string;
  mealProvision?: string;
  mealAmount?: string;
  dormProvision?: string;
  dormAmount?: string;
  utilitiesProvision?: string;
  utilitiesAmount?: string;
  holidays?: string;
  otherBenefits?: string;
  notes?: string;
};

const STRING_FIELDS: (keyof JobPostingFields)[] = [
  "jobDescription", "workLocation", "nearestStation", "headcount", "gender", "nationality",
  "workTime1Start", "workTime1End", "workTime2Start", "workTime2End",
  "overtime", "avgMonthlyOvertime", "fixedOvertimeHours", "fixedOvertimePay",
  "monthlyGross", "basicSalary", "salaryCalcMethod", "perfectAttendance",
  "housingAllowance", "nightShiftAllowance", "commuteAllowance",
  "socialInsurance", "employmentInsurance", "healthInsurance", "pensionInsurance",
  "incomeTax", "residentTax",
  "mealProvision", "mealAmount", "dormProvision", "dormAmount",
  "utilitiesProvision", "utilitiesAmount",
  "holidays", "otherBenefits", "notes",
];

// Docs テンプレ側の日本語 placeholder ({{勤務地}} など) と、AI 抽出結果の英語キーのマッピング
const JP_KEY_MAP: Record<keyof JobPostingFields, string[]> = {
  title: ["求人名", "タイトル"],
  jobDescription: ["仕事内容"],
  workLocation: ["勤務地"],
  nearestStation: ["最寄り駅", "最寄駅"],
  headcount: ["募集人数"],
  gender: ["性別"],
  nationality: ["国籍"],
  workTime1Start: ["勤務時間1開始"],
  workTime1End: ["勤務時間1終了"],
  workTime2Start: ["勤務時間2開始"],
  workTime2End: ["勤務時間2終了"],
  overtime: ["残業有無", "残業"],
  avgMonthlyOvertime: ["月間平均残業時間"],
  fixedOvertimeHours: ["固定残業時間"],
  fixedOvertimePay: ["固定残業代"],
  monthlyGross: ["月総支給額"],
  basicSalary: ["基本給"],
  salaryCalcMethod: ["給与計算方法"],
  perfectAttendance: ["皆勤手当"],
  housingAllowance: ["住宅手当"],
  nightShiftAllowance: ["深夜手当"],
  commuteAllowance: ["通勤手当"],
  socialInsurance: ["社会保険料"],
  employmentInsurance: ["雇用保険料"],
  healthInsurance: ["健康保険料"],
  pensionInsurance: ["厚生年金保険料"],
  incomeTax: ["所得税"],
  residentTax: ["住民税"],
  mealProvision: ["食費支給有無", "食費支給"],
  mealAmount: ["食費金額"],
  dormProvision: ["寮費有無", "寮有無"],
  dormAmount: ["寮費金額", "寮費"],
  utilitiesProvision: ["光熱費有無"],
  utilitiesAmount: ["光熱費金額"],
  holidays: ["休日詳細", "休日"],
  otherBenefits: ["福利厚生", "その他手当"],
  notes: ["特記事項", "備考"],
};

// 勤務時間の結合キー (例: 勤務時間1 = 09:00〜18:00) も自動生成
function buildWorkTimeString(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return "";
  if (start && end) return `${start}〜${end}`;
  return start || end || "";
}

function clean(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get("dealId");
    const jobPostings = await prisma.jobPosting.findMany({
      where: dealId ? { dealId: Number(dealId) } : undefined,
      include: {
        deal: { select: { title: true, company: { select: { name: true } } } },
        template: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ ok: true, jobPostings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const dealId = Number(body?.dealId);
    if (!Number.isFinite(dealId)) {
      return Response.json({ ok: false, error: "dealId が必要です" }, { status: 400 });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { company: true },
    });
    if (!deal) {
      return Response.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });
    }

    const templateId = body?.templateId ? Number(body.templateId) : null;
    const title = clean(body?.title) ?? `${deal.company.name} ${deal.title} 求人票`;

    const fields: Record<string, string | null> = {};
    for (const key of STRING_FIELDS) {
      fields[key] = clean(body?.[key]);
    }

    let documentId: string | null = null;
    let documentUrl: string | null = null;
    let driveFolderUrl: string | null = null;
    // Drive 連携が失敗した場合の警告 (UI に表示するため 応答に含める)
    let driveWarning: string | null = null;

    // テンプレート指定ありかつ Drive 設定がある場合は Google Docs を複製
    if (templateId) {
      const template = await prisma.jobPostingTemplate.findUnique({ where: { id: templateId } });
      if (template) {
        try {
          // 求人票は企業フォルダに保存 (企業ID で既存フォルダを検索、なければ新規作成)
          const folder = await ensureCompanyDriveFolder({
            existingFolderUrl: deal.company.driveFolderUrl,
            externalId: deal.company.externalId,
            companyName: deal.company.name,
          });
          driveFolderUrl = folder.folderUrl;

          // 初めて作成した場合は Company.driveFolderUrl を保存
          if (!deal.company.driveFolderUrl && folder.folderUrl) {
            await prisma.company.update({
              where: { id: deal.company.id },
              data: { driveFolderUrl: folder.folderUrl },
            });
          }

          // テンプレートの差し込み変数を日本語 placeholder に変換して組み立てる
          const replacements: Record<string, string> = {
            会社名: deal.company.name,
            案件名: deal.title,
            タイトル: title,
            求人名: title,
            案件ID: String(deal.id),
            作成日: new Date().toLocaleDateString("ja-JP"),
            分野: deal.field ?? "",
            // 未設定項目はよく聞かれるがフォームに無いので空で初期化 (テンプレに出ても空で消える)
            雇用形態: "",
            ビザ種類: "",
            雇用期間: "",
            勤務時間1休憩分: "",
            勤務時間2休憩分: "",
            勤務時間3休憩分: "",
            勤務時間3: "",
          };
          for (const key of STRING_FIELDS) {
            const value = fields[key];
            if (!value) continue;
            // 英語キーでも従来通り置換できるように維持
            replacements[key] = value;
            // 日本語 placeholder にマッピング
            const jpKeys = JP_KEY_MAP[key] ?? [];
            for (const jpKey of jpKeys) {
              replacements[jpKey] = value;
            }
          }
          // 勤務時間1/2 の結合を追加 (テンプレで {{勤務時間1}} と書いてある想定)
          replacements["勤務時間1"] = buildWorkTimeString(fields.workTime1Start, fields.workTime1End);
          replacements["勤務時間2"] = buildWorkTimeString(fields.workTime2Start, fields.workTime2End);

          const filledKeys = Object.entries(replacements)
            .filter(([, v]) => typeof v === "string" && v.trim() !== "")
            .map(([k]) => k);
          console.log(
            `[job-postings] dealId=${dealId} replacements: ${filledKeys.length} filled / ${Object.keys(replacements).length} total`,
            filledKeys.join(",")
          );
          const generated = await createResumeDocumentFromTemplate({
            templateUrl: template.templateUrl,
            folderUrl: folder.folderUrl,
            title,
            replacements,
          });
          documentId = generated.documentId;
          documentUrl = generated.documentUrl;
        } catch (error) {
          // Drive 連携が失敗した場合は フィールドのみ DB 保存し、警告を応答に含める。
          // UI で「Drive に保存できませんでした」というメッセージを見せる。
          const message = error instanceof Error ? error.message : String(error);
          console.warn("JobPosting: skip Docs generation", error);
          driveWarning = message;
        }
      }
    }

    const jobPosting = await prisma.jobPosting.create({
      data: {
        dealId,
        templateId,
        title,
        documentId,
        documentUrl,
        driveFolderUrl,
        status: documentId ? "generated" : "draft",
        ...fields,
      },
      include: {
        deal: { select: { title: true, company: { select: { name: true } } } },
        template: { select: { name: true } },
      },
    });

    return Response.json({ ok: true, jobPosting, driveWarning });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
