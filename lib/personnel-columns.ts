export type PersonnelColumnKey =
  | "name"
  | "englishName"
  | "nationality"
  | "channel"
  | "residenceStatus"
  | "partner"
  | "phoneNumber"
  | "gender"
  | "birthDate"
  | "age"
  | "postalCode"
  | "address"
  | "spouseStatus"
  | "childrenCount"
  | "motivation"
  | "selfIntroduction"
  | "japanPurpose"
  | "currentJob"
  | "retirementReason"
  | "preferenceNote"
  | "visaExpiryDate"
  | "japaneseLevel"
  | "japaneseLevelDate"
  | "japaneseCheckLevel"
  | "licenseName"
  | "licenseExpiryDate"
  | "otherQualificationName"
  | "otherQualificationExpiryDate"
  | "traineeExperience"
  | "highSchoolName"
  | "highSchoolPeriod"
  | "universityName"
  | "universityPeriod";

export const PERSONNEL_COLUMN_SECTIONS: {
  id: string;
  label: string;
  items: { key: PersonnelColumnKey; label: string }[];
}[] = [
  {
    id: "basic",
    label: "基本情報",
    items: [
      { key: "name", label: "カタカナ名" },
      { key: "englishName", label: "英語名" },
      { key: "nationality", label: "国籍" },
      { key: "channel", label: "連絡手段" },
      { key: "partner", label: "紹介パートナー" },
      { key: "phoneNumber", label: "携帯番号" },
      { key: "gender", label: "性別" },
      { key: "birthDate", label: "生年月日" },
      { key: "age", label: "年齢" },
      { key: "address", label: "住所" },
      { key: "postalCode", label: "郵便番号" },
      { key: "spouseStatus", label: "配偶者" },
      { key: "childrenCount", label: "子供" },
      { key: "motivation", label: "志望動機" },
      { key: "selfIntroduction", label: "自己紹介" },
      { key: "japanPurpose", label: "来日目的" },
      { key: "currentJob", label: "現在の仕事" },
      { key: "retirementReason", label: "退職理由" },
      { key: "preferenceNote", label: "本人希望記入欄" },
    ],
  },
  {
    id: "qualification",
    label: "資格・学歴",
    items: [
      { key: "residenceStatus", label: "現在の在留資格" },
      { key: "visaExpiryDate", label: "在留資格の有効期限" },
      { key: "japaneseLevel", label: "日本語検定" },
      { key: "japaneseLevelDate", label: "日本語検定取得日" },
      { key: "japaneseCheckLevel", label: "日本語チェック(AI)" },
      { key: "licenseName", label: "免許" },
      { key: "licenseExpiryDate", label: "免許の有効期限" },
      { key: "otherQualificationName", label: "その他の資格" },
      { key: "otherQualificationExpiryDate", label: "その他資格の有効期限" },
      { key: "traineeExperience", label: "実習経験の有無" },
      { key: "highSchoolName", label: "高校名" },
      { key: "highSchoolPeriod", label: "高校期間" },
      { key: "universityName", label: "大学名" },
      { key: "universityPeriod", label: "大学期間" },
    ],
  },
  {
    id: "visa",
    label: "各在留資格",
    items: [
      { key: "residenceStatus", label: "在留資格" },
      { key: "visaExpiryDate", label: "在留資格の有効期限" },
    ],
  },
];

export const DEFAULT_PERSONNEL_COLUMNS: PersonnelColumnKey[] = [
  "name",
  "englishName",
  "nationality",
  "residenceStatus",
  "channel",
];

export const MAX_PERSONNEL_COLUMNS = 5;
