type ResumeLine = {
  date?: string | null;
  label?: string | null;
  result?: string | null;
};

type ResumeProfileInput = {
  gender?: string | null;
  country?: string | null;
  spouseStatus?: string | null;
  childrenCount?: string | null;
  visaType?: string | null;
  visaExpiryDate?: string | null;
  educations?: unknown;
  workExperiences?: unknown;
  certifications?: unknown;
  motivation?: string | null;
  selfIntroduction?: string | null;
  japanPurpose?: string | null;
  currentJob?: string | null;
  retirementReason?: string | null;
  preferenceNote?: string | null;
  japaneseLevel?: string | null;
  japaneseLevelDate?: string | null;
  licenseName?: string | null;
  licenseExpiryDate?: string | null;
  otherQualificationName?: string | null;
  otherQualificationExpiryDate?: string | null;
  traineeExperience?: string | null;
  highSchoolName?: string | null;
  highSchoolStartDate?: string | null;
  highSchoolEndDate?: string | null;
  universityName?: string | null;
  universityStartDate?: string | null;
  universityEndDate?: string | null;
};

type ResumeDocumentInput = {
  person: {
    name: string;
    nationality: string;
    residenceStatus: string;
    email?: string | null;
    onboarding?: {
      englishName?: string | null;
      birthDate?: string | null;
      phoneNumber?: string | null;
      postalCode?: string | null;
      address?: string | null;
    } | null;
    resumeProfile?: ResumeProfileInput | null;
  };
};

function valueOrBlank(value?: string | null) {
  return value?.trim() || "";
}

function calcAge(birthDate?: string | null) {
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

/** "1997-11-20" → "1997年11月20日" */
function formatDateJapanese(dateInput?: string | null) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return dateInput;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** "2017-07-01" or "2017-07" → "2017年7月" */
function formatYearMonth(input?: string | null) {
  if (!input) return "";
  const s = input.trim();
  if (!s) return "";
  // ISO yyyy-mm or yyyy-mm-dd
  const m = s.match(/^(\d{4})[-\/](\d{1,2})/);
  if (m) {
    return `${Number(m[1])}年${Number(m[2])}月`;
  }
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }
  return s;
}

function mapLine(lines: ResumeLine[] | null | undefined, index: number) {
  const line = lines?.[index];
  return {
    date: valueOrBlank(line?.date),
    label: valueOrBlank(line?.label),
    result: valueOrBlank(line?.result),
  };
}

function asResumeLines(value: unknown) {
  return Array.isArray(value) ? (value as ResumeLine[]) : [];
}

type WorkLine = { date: string; endDate: string; label: string; result: string };

function asWorkLines(value: unknown): WorkLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const current = typeof line === "object" && line !== null ? (line as Record<string, unknown>) : {};
    return {
      date: valueOrBlank(String(current.startDate ?? current.date ?? "")),
      endDate: valueOrBlank(String(current.endDate ?? "")),
      label: valueOrBlank(String(current.companyName ?? current.label ?? "")),
      result: valueOrBlank(String(current.reason ?? current.result ?? "")),
    };
  });
}

function mapWorkLine(lines: WorkLine[], index: number) {
  const line = lines[index];
  return {
    date: valueOrBlank(line?.date),
    endDate: valueOrBlank(line?.endDate),
    label: valueOrBlank(line?.label),
    result: valueOrBlank(line?.result),
  };
}

export function buildResumePlaceholders(input: ResumeDocumentInput) {
  const person = input.person;
  const onboarding = person.onboarding;
  const profile = person.resumeProfile;
  const educationLines = asResumeLines(profile?.educations);
  const workLines = asWorkLines(profile?.workExperiences);
  const certLines = asResumeLines(profile?.certifications);

  // 学歴 (高校 / 大学 / その他)
  const education1 = {
    date: valueOrBlank(profile?.highSchoolStartDate),
    label: valueOrBlank(profile?.highSchoolName),
    result: valueOrBlank(profile?.highSchoolEndDate),
  };
  const education2 = {
    date: valueOrBlank(profile?.universityStartDate),
    label: valueOrBlank(profile?.universityName),
    result: valueOrBlank(profile?.universityEndDate),
  };
  const education3 = mapLine(educationLines, 0);

  // テンプレで使う最大件数
  const MAX_WORKS = 4;
  const MAX_CERTS = 4;

  // 職歴: 最大 N 件 — 退社ラベルは reason 内容ではなく常に「退社」を出す。
  // reason 自体は別 placeholder ({{退職理由N}}) で参照できる。
  const works: ReturnType<typeof mapWorkLine>[] = [];
  for (let i = 0; i < MAX_WORKS; i++) {
    const w = mapWorkLine(workLines, i);
    works.push(w);
  }

  // 資格: 最大 N 件
  //   1. JLPT / JFT 日本語検定 (japaneseLevel + japaneseLevelDate)
  //   2. その他の資格 (otherQualificationName + otherQualificationExpiryDate)
  //   3〜. certifications JSON
  // 重複は label + date で除去
  const rawCerts: { date: string; label: string }[] = [];
  const jpLevel = valueOrBlank(profile?.japaneseLevel);
  if (jpLevel) {
    rawCerts.push({ date: valueOrBlank(profile?.japaneseLevelDate), label: jpLevel });
  }
  const otherQual = valueOrBlank(profile?.otherQualificationName);
  if (otherQual) {
    rawCerts.push({ date: valueOrBlank(profile?.otherQualificationExpiryDate), label: otherQual });
  }
  for (const line of certLines) {
    const c = { date: valueOrBlank(line.date), label: valueOrBlank(line.label) };
    if (c.label) rawCerts.push(c);
  }
  // 重複除去 (label + date)
  const dedup = new Map<string, { date: string; label: string }>();
  for (const c of rawCerts) {
    const key = `${c.label}__${c.date}`;
    if (!dedup.has(key)) dedup.set(key, c);
  }
  const certs: { date: string; label: string }[] = [];
  for (const c of dedup.values()) {
    if (certs.length >= MAX_CERTS) break;
    certs.push(c);
  }
  while (certs.length < MAX_CERTS) certs.push({ date: "", label: "" });

  // 日本就労ビザ: 在留資格が「持っていない」/空欄/未設定なら「無」、
  // それ以外 (技能実習/特定技能/技人国/留学生/特定活動/永住/不明 など何か選択されていれば) → 「有」
  const visaTypeLabel = valueOrBlank(profile?.visaType) || valueOrBlank(person.residenceStatus);
  const visaExpiry = formatYearMonth(profile?.visaExpiryDate);
  const NO_VISA = ["持っていない", "", "未設定", "なし"];
  const hasResidenceStatus = !!visaTypeLabel && !NO_VISA.includes(visaTypeLabel);
  const visaWorkAriNashi = hasResidenceStatus ? "有" : "無";

  return {
    作成日: formatDateJapanese(new Date().toISOString()),
    カタカナ名: valueOrBlank(person.name),
    英語名: valueOrBlank(onboarding?.englishName),
    顔写真: "",
    性別: valueOrBlank(profile?.gender),
    国籍: valueOrBlank(profile?.country) || valueOrBlank(person.nationality),
    生年月日: formatDateJapanese(onboarding?.birthDate),
    年齢: calcAge(onboarding?.birthDate),
    現住所: valueOrBlank(onboarding?.address),
    携帯電話: valueOrBlank(onboarding?.phoneNumber),
    電話: valueOrBlank(onboarding?.phoneNumber),
    電話番号: valueOrBlank(onboarding?.phoneNumber),
    メール: valueOrBlank(person.email),
    ビザの種類: visaTypeLabel,
    在留資格: valueOrBlank(person.residenceStatus),
    在留資格の有効期限: formatYearMonth(profile?.visaExpiryDate),
    // 「日本就労ビザ」: 就労可能ビザの有無 (あり / なし)
    日本就労ビザ: visaWorkAriNashi,
    就労ビザ: visaWorkAriNashi,
    // 互換用: 期限など詳細が必要なテンプレ用
    日本就労ビザ詳細: [visaTypeLabel, visaExpiry ? `(${visaExpiry}まで)` : ""].filter(Boolean).join(" "),
    // 日本語検定 (独立 placeholder としても残す)
    日本語検定: valueOrBlank(profile?.japaneseLevel),
    日本語検定取得日: formatYearMonth(profile?.japaneseLevelDate),
    // テンプレで多用されるエイリアス
    "合格している日本語検定": valueOrBlank(profile?.japaneseLevel),
    "日本語レベル": valueOrBlank(profile?.japaneseLevel),
    "日本語能力": valueOrBlank(profile?.japaneseLevel),
    JLPT: valueOrBlank(profile?.japaneseLevel),
    配偶者: valueOrBlank(profile?.spouseStatus),
    子供数: valueOrBlank(profile?.childrenCount),
    子供: valueOrBlank(profile?.childrenCount),
    備考欄: valueOrBlank(profile?.traineeExperience),
    // 学歴 (年月形式に変換)
    入学: formatYearMonth(education1.date),
    卒業: formatYearMonth(education1.result),
    入学_大学: formatYearMonth(education2.date),
    卒業_大学: formatYearMonth(education2.result),
    大学名: education2.label,
    入学1: formatYearMonth(education1.date),
    高校名: education1.label,
    学校名1: education1.label,
    卒業1: formatYearMonth(education1.result),
    入学2: formatYearMonth(education2.date),
    学校名2: education2.label,
    卒業2: formatYearMonth(education2.result),
    入学3: formatYearMonth(education3.date),
    学校名3: education3.label,
    卒業3: formatYearMonth(education3.result),
    // 職歴・資格は最大 N 件分のキーを生成
    ...buildIndexedPlaceholders(works, certs, profile),
    志望動機: valueOrBlank(profile?.motivation),
    自己紹介: valueOrBlank(profile?.selfIntroduction),
    来日目的: valueOrBlank(profile?.japanPurpose),
    現在の仕事: valueOrBlank(profile?.currentJob),
    退職理由: valueOrBlank(profile?.retirementReason),
    本人希望記入欄: valueOrBlank(profile?.preferenceNote),
  };
}

function buildIndexedPlaceholders(
  works: { date: string; endDate: string; label: string; result: string }[],
  certs: { date: string; label: string }[],
  profile: ResumeProfileInput | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < works.length; i++) {
    const n = i + 1;
    const w = works[i];
    const hasData = Boolean(w.label || w.date || w.endDate);
    const company = w.label.trim();
    map[`入社${n}`] = formatYearMonth(w.date);
    map[`退社${n}`] = formatYearMonth(w.endDate);
    // 入社行: "{会社名} 入社" (会社名が空なら空文字)
    map[`会社名${n}`] = company ? `${company} 入社` : hasData ? "入社" : "";
    // 退社行: "{会社名} 退社" (会社名が空なら "退社" 単体)
    map[`退社${n}ラベル`] = company ? `${company} 退社` : hasData ? "退社" : "";
    // 退職理由は別 placeholder で参照可能
    map[`退職理由${n}`] = w.result;
  }
  for (let i = 0; i < certs.length; i++) {
    const n = i + 1;
    const c = certs[i];
    map[`資格${n}`] = c.label;
    map[`資格年${n}`] = formatYearMonth(c.date);
  }
  // 互換: 免許 / 免許年
  map["免許"] = valueOrBlank(profile?.licenseName);
  map["免許年"] = formatYearMonth(profile?.licenseExpiryDate);
  return map;
}

export function parseResumeLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date = "", label = "", result = ""] = line.split("|").map((part) => part.trim());
      return { date, label, result };
    });
}

export function stringifyResumeLines(lines: ResumeLine[] | null | undefined) {
  return (lines ?? [])
    .map((line) => [valueOrBlank(line.date), valueOrBlank(line.label), valueOrBlank(line.result)].join(" | "))
    .join("\n");
}
