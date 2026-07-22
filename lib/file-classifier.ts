/**
 * アップロードされたファイル名から書類種別 (kind) を推定する。
 *
 * 使い方:
 *   const suggestion = classifyByFileName("passport_scan.pdf");
 *   // → { kind: "passport", label: "パスポート", confidence: "high", source: "filename" }
 *
 * 判定できないファイルは null を返す。AI 分類のフォールバックに回す。
 */

/**
 * 全在留資格で共通の書類 kind。
 * candidate-profile.ts の getDocumentDefinitions で status 毎に絞られているが、
 * アップロード分類はまず 全 kind の中から推定してから DB に反映する。
 */
export type DocumentKindDef = {
  kind: string;
  label: string;
};

/** 分類器が返しうる全 kind (BASIC + 各在留資格別 + 追加共通) */
export const ALL_DOCUMENT_KINDS: DocumentKindDef[] = [
  // 全在留資格 共通
  { kind: "photo", label: "顔写真" },
  { kind: "residence-card", label: "在留カード (表面)" },
  { kind: "residence-card-back", label: "在留カード (裏面)" },
  { kind: "passport", label: "パスポート" },
  { kind: "resume", label: "履歴書" },
  { kind: "jlpt-certificate", label: "JLPT 合格証" },
  { kind: "driver-license", label: "運転免許証" },
  // 技能実習
  { kind: "trainee-evaluation", label: "実習生評価書 / 終了証明書 / 専門級・随時3級" },
  // 特定技能 共通
  { kind: "ssw-exam-certificate", label: "特定技能1号評価試験 / 技能測定試験の合格証" },
  { kind: "skill-test-certificate", label: "技能検定の合格証書" },
  { kind: "designation-letter", label: "指定書" },
  { kind: "tokutei-2-certificate", label: "特定技能2号 合格資格" },
  // 留学生
  { kind: "graduation-prospect", label: "卒業見込み" },
  { kind: "transcript", label: "成績証明書" },
  { kind: "student-id", label: "学生証" },
  // 技人国
  { kind: "transcript-jp", label: "成績証明書 (日本語版)" },
  { kind: "transcript-original", label: "成績証明書 (原版・海外卒業者)" },
  { kind: "graduation-certificate", label: "卒業証明書" },
  { kind: "career-history", label: "職務経歴書" },
  // その他
  { kind: "other", label: "その他" },
];

export function getDocumentKindLabel(kind: string): string {
  return ALL_DOCUMENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** ファイル名判定ルール (先に書いた方が優先) */
const FILENAME_RULES: {
  kind: string;
  patterns: RegExp[];
}[] = [
  {
    kind: "photo",
    patterns: [
      /顔写真/i,
      /(^|[^a-z])photo([^a-z]|$)/i,
      /(^|[^a-z])face([^a-z]|$)/i,
      /(^|[^a-z])id[-_ ]?photo/i,
      /証明写真/i,
    ],
  },
  {
    kind: "passport",
    patterns: [/passport/i, /パスポート/, /旅券/],
  },
  {
    kind: "residence-card-back",
    patterns: [/(在留カード|residence[-_ ]?card|zairyu).*裏/i, /裏面/, /back[-_ ]?side/i, /(zairyu|residence).*back/i],
  },
  {
    kind: "residence-card",
    patterns: [/在留カード/, /residence[-_ ]?card/i, /zairyu/i],
  },
  {
    kind: "resume",
    patterns: [/履歴書/, /(^|[^a-z])resume([^a-z]|$)/i, /(^|[^a-z])cv([^a-z]|$)/i, /rirekisho/i],
  },
  {
    kind: "career-history",
    patterns: [/職務経歴書/, /career[-_ ]?history/i, /work[-_ ]?history/i],
  },
  {
    kind: "jlpt-certificate",
    patterns: [/jlpt/i, /日本語能力.*(合格|証書)/, /n[1-5][-_ ]?(合格|certificate|証書)/i],
  },
  {
    kind: "driver-license",
    patterns: [/運転免許/, /driver[-_ ]?license/i, /driving[-_ ]?license/i, /免許証/],
  },
  {
    kind: "trainee-evaluation",
    patterns: [/実習生評価/, /専門級/, /随時[123]級/, /終了証明/, /trainee[-_ ]?evaluation/i],
  },
  {
    // 特定技能1号評価試験 / 技能測定試験。技能検定より先に判定する
    kind: "ssw-exam-certificate",
    patterns: [
      /特定技能.*(評価試験|測定試験)/,
      /技能測定試験/,
      /ssw.*(exam|test)/i,
      /prometric/i,
    ],
  },
  {
    kind: "skill-test-certificate",
    patterns: [/技能検定/, /技能試験.*合格/, /skill[-_ ]?test/i, /専門級/],
  },
  {
    kind: "designation-letter",
    patterns: [/指定書/, /designation[-_ ]?letter/i],
  },
  {
    kind: "tokutei-2-certificate",
    patterns: [/特定技能2号.*(合格|資格)/, /tokutei[-_ ]?2/i],
  },
  {
    kind: "graduation-prospect",
    patterns: [/卒業見込/, /graduation[-_ ]?prospect/i, /expected[-_ ]?graduation/i],
  },
  {
    kind: "graduation-certificate",
    patterns: [/卒業証明/, /graduation[-_ ]?certificate/i, /diploma/i],
  },
  {
    kind: "transcript-jp",
    patterns: [/成績証明.*日本語/, /transcript.*jp/i, /transcript.*japanese/i],
  },
  {
    kind: "transcript-original",
    patterns: [/成績証明.*(原版|海外|original)/i, /transcript.*(original|overseas)/i],
  },
  {
    kind: "transcript",
    patterns: [/成績証明/, /transcript/i, /grade[-_ ]?sheet/i],
  },
  {
    kind: "student-id",
    patterns: [/学生証/, /student[-_ ]?id/i, /student[-_ ]?card/i],
  },
];

export type FileClassifyResult = {
  kind: string;
  label: string;
  confidence: "high" | "medium" | "low";
  source: "filename";
};

/**
 * ファイル名からファイル種別を推定。マッチなしなら null。
 */
export function classifyByFileName(fileName: string | null | undefined): FileClassifyResult | null {
  if (!fileName) return null;
  const base = fileName.replace(/\.[^.]+$/, "");
  for (const rule of FILENAME_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(base)) {
        return {
          kind: rule.kind,
          label: getDocumentKindLabel(rule.kind),
          confidence: "high",
          source: "filename",
        };
      }
    }
  }
  return null;
}
