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

function formatDateJapanese(dateInput?: string | null) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return dateInput;
  return new Intl.DateTimeFormat("ja-JP").format(date);
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

  // 未入力の職歴・大学等の行は placeholder が {{…}} のまま残らないように、
  // 空文字ではなく行全体を視覚的に消せる半角スペースで置換する。
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

  // テンプレで使う最大件数 (テンプレ側の枠数と合わせる)
  const MAX_WORKS = 4;
  const MAX_CERTS = 4;

  // 職歴: 最大 N 件 (テンプレに枠を並べてもらい、空の枠は行ごと自動削除)
  const works: ReturnType<typeof mapWorkLine>[] = [];
  for (let i = 0; i < MAX_WORKS; i++) {
    const w = mapWorkLine(workLines, i);
    // 退社理由が空でも、会社/入社/退社のいずれかが入っていれば
    // 「退社」ラベルをデフォルト表示する (空白に見えるのを防止)
    const hasAnyData = Boolean(w.label || w.date || w.endDate);
    if (hasAnyData && !w.result) {
      w.result = "退社";
    }
    works.push(w);
  }

  // 資格: 最大 N 件 (1=その他資格, 2以降は certifications JSON)
  // 免許は {{免許}} / {{免許年}}、日本語検定は {{日本語検定}} / {{日本語検定取得日}}
  // にそれぞれ独立した placeholder で出すので、資格行には含めない
  const certs: { date: string; label: string }[] = [];
  certs.push({
    date: valueOrBlank(profile?.otherQualificationExpiryDate),
    label: valueOrBlank(profile?.otherQualificationName),
  });
  const remainingCerts = Math.max(0, MAX_CERTS - certs.length);
  for (let i = 0; i < remainingCerts; i++) {
    const line = mapLine(certLines, i);
    certs.push({ date: line.date, label: line.label });
  }

  return {
    作成日: new Intl.DateTimeFormat("ja-JP").format(new Date()),
    カタカナ名: valueOrBlank(person.name),
    英語名: valueOrBlank(onboarding?.englishName),
    // {{顔写真}} は別ステップで画像挿入するため、ここでは空に置換して残骸を消す
    顔写真: "",
    性別: valueOrBlank(profile?.gender),
    国籍: valueOrBlank(profile?.country) || valueOrBlank(person.nationality),
    生年月日: formatDateJapanese(onboarding?.birthDate),
    年齢: calcAge(onboarding?.birthDate),
    現住所: valueOrBlank(onboarding?.address),
    // テンプレに {{携帯電話}} / {{電話}} どちらが書かれていても電話番号が入るようにする
    携帯電話: valueOrBlank(onboarding?.phoneNumber),
    電話: valueOrBlank(onboarding?.phoneNumber),
    電話番号: valueOrBlank(onboarding?.phoneNumber),
    メール: valueOrBlank(person.email),
    ビザの種類: valueOrBlank(profile?.visaType) || valueOrBlank(person.residenceStatus),
    在留資格: valueOrBlank(person.residenceStatus),
    在留資格の有効期限: valueOrBlank(profile?.visaExpiryDate),
    // 日本語検定は資格行ではなく独立した placeholder
    日本語検定: valueOrBlank(profile?.japaneseLevel),
    日本語検定取得日: valueOrBlank(profile?.japaneseLevelDate),
    配偶者: valueOrBlank(profile?.spouseStatus),
    子供数: valueOrBlank(profile?.childrenCount),
    子供: valueOrBlank(profile?.childrenCount),
    就労ビザ: "",
    備考欄: valueOrBlank(profile?.traineeExperience),
    // 高校 (単数形キー。テンプレ側で {{入学}} / {{卒業}} と書かれている分)
    入学: education1.date,
    卒業: education1.result,
    // 大学 (単数形キー)
    入学_大学: education2.date,
    卒業_大学: education2.result,
    大学名: education2.label,
    // 互換用 (数字付きキー)
    入学1: education1.date,
    高校名: education1.label,
    卒業1: education1.result,
    入学2: education2.date,
    学校名2: education2.label,
    卒業2: education2.result,
    入学3: education3.date,
    学校名3: education3.label,
    卒業3: education3.result,
    // 職歴・資格は最大 10 件分のキーを生成 (使われていない番号は空文字)
    ...buildIndexedPlaceholders(works, certs, profile),
    志望動機: valueOrBlank(profile?.motivation),
    自己紹介: valueOrBlank(profile?.selfIntroduction),
    来日目的: valueOrBlank(profile?.japanPurpose),
    現在の仕事: valueOrBlank(profile?.currentJob),
    退職理由: valueOrBlank(profile?.retirementReason),
    本人希望記入欄: valueOrBlank(profile?.preferenceNote),
  };
}

// 職歴 N (最大10) と 資格 N (最大10) のキーをまとめて生成。
// 互換のため {{免許}} / {{免許年}} は資格1番にも展開する。
function buildIndexedPlaceholders(
  works: { date: string; endDate: string; label: string; result: string }[],
  certs: { date: string; label: string }[],
  profile: ResumeProfileInput | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < works.length; i++) {
    const n = i + 1;
    const w = works[i];
    map[`入社${n}`] = w.date;
    map[`退社${n}`] = w.endDate;
    map[`会社名${n}`] = w.label;
    map[`退社${n}ラベル`] = w.result;
  }
  for (let i = 0; i < certs.length; i++) {
    const n = i + 1;
    const c = certs[i];
    map[`資格${n}`] = c.label;
    map[`資格年${n}`] = c.date;
  }
  // 互換: 免許 / 免許年 は資格1相当 (=licenseName/licenseExpiryDate) を再掲
  map["免許"] = valueOrBlank(profile?.licenseName);
  map["免許年"] = valueOrBlank(profile?.licenseExpiryDate);
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
