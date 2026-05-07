export const NATIONALITIES = ["ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ", "その他"];

// 履歴書テンプレや書類管理で扱う在留資格 (留学生 / 特定活動 を追加)
export const RESIDENCE_STATUSES = [
  "技能実習",
  "特定技能1号",
  "特定技能2号",
  "技術・人文知識・国際業務",
  "留学生",
  "特定活動",
];

export const CHANNELS = [
  { value: "未設定", label: "未設定" },
  { value: "LINE", label: "LINE" },
  { value: "Messenger", label: "Messenger" },
  { value: "mail", label: "メール" },
  { value: "WhatsApp", label: "WhatsApp" },
];

export const GENDERS = ["男性", "女性", "その他"];

// 全在留資格に共通する書類 (常に提出)
export const BASIC_DOCUMENTS = [
  { kind: "residence-card", label: "在留カード" },
] as const;

// 技能実習: 専門級 / 随時3級 / 実習生評価書 / 終了証明書 + 技能検定合格証書
const TRAINEE_DOCUMENTS = [
  { kind: "trainee-evaluation", label: "実習生評価書 / 終了証明書 / 専門級・随時3級" },
  { kind: "skill-test-certificate", label: "技能検定の合格証書" },
] as const;

// 特定技能1号: 指定書 + 技能検定合格証書
const TOKUTEI_1_DOCUMENTS = [
  { kind: "designation-letter", label: "指定書" },
  { kind: "skill-test-certificate", label: "技能検定の合格証書" },
] as const;

// 特定技能2号: 特定技能2号合格資格 + 指定書
const TOKUTEI_2_DOCUMENTS = [
  { kind: "tokutei-2-certificate", label: "特定技能2号 合格資格" },
  { kind: "designation-letter", label: "指定書" },
] as const;

// 留学生: 卒業見込み / 成績証明書 / 技能検定合格証書 (特定技能変更時必須) / 学生証
const STUDENT_DOCUMENTS = [
  { kind: "graduation-prospect", label: "卒業見込み" },
  { kind: "transcript", label: "成績証明書" },
  { kind: "skill-test-certificate", label: "技能検定の合格証書 (特定技能変更時必須)" },
  { kind: "student-id", label: "学生証" },
] as const;

// 技人国 (技術・人文知識・国際業務): 成績証明書 (日本語版+原版) / 卒業証明書 / 職務経歴書
const GIJINKOKU_DOCUMENTS = [
  { kind: "transcript-jp", label: "成績証明書 (日本語版)" },
  { kind: "transcript-original", label: "成績証明書 (原版・海外卒業者)" },
  { kind: "graduation-certificate", label: "卒業証明書" },
  { kind: "career-history", label: "職務経歴書" },
] as const;

// 特定活動: 指定書
const TOKUTEI_ACTIVITY_DOCUMENTS = [
  { kind: "designation-letter", label: "指定書" },
] as const;

// 互換用 (旧コードが import している)
export const TOKUTEI_DOCUMENTS = TOKUTEI_1_DOCUMENTS;

export function getDocumentDefinitions(residenceStatus: string): { kind: string; label: string }[] {
  switch (residenceStatus) {
    case "技能実習":
      return [...BASIC_DOCUMENTS, ...TRAINEE_DOCUMENTS];
    case "特定技能1号":
      return [...BASIC_DOCUMENTS, ...TOKUTEI_1_DOCUMENTS];
    case "特定技能2号":
      return [...BASIC_DOCUMENTS, ...TOKUTEI_2_DOCUMENTS];
    case "留学生":
      return [...BASIC_DOCUMENTS, ...STUDENT_DOCUMENTS];
    case "技術・人文知識・国際業務":
      return [...BASIC_DOCUMENTS, ...GIJINKOKU_DOCUMENTS];
    case "特定活動":
      return [...BASIC_DOCUMENTS, ...TOKUTEI_ACTIVITY_DOCUMENTS];
    default:
      return [...BASIC_DOCUMENTS];
  }
}

export function calculateAge(birthDate?: string | null) {
  if (!birthDate) return "";
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthPassed =
    now.getMonth() > date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!monthPassed) age -= 1;
  return String(age);
}

export type WorkHistoryEntry = {
  companyName: string;
  startDate: string;
  endDate: string;
  reason: string;
};

export function normalizeWorkHistories(value: unknown): WorkHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const current = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      companyName: String(current.companyName ?? current.label ?? ""),
      startDate: String(current.startDate ?? current.date ?? ""),
      endDate: String(current.endDate ?? ""),
      reason: String(current.reason ?? current.result ?? ""),
    };
  });
}
