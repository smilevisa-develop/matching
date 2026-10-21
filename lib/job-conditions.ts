/**
 * 求人条件 (Deal.conditions) の入力項目。2026/10 の「求人テンプレート」(スプシ) と同じ項目・並び・選択肢。
 * これ以外の項目はノイズになるので入力欄に出さない (特記事項とメモだけ追加)。
 *
 * 以前の項目 (勤務開始1・皆勤手当・社会保険料 など) のデータは消さずに残し、
 * 新しい項目が空なら、以前の項目から作った値を初期値として入れる (migrateLegacyConditions)。
 * 求人票 (Google ドキュメント) の差し込みは placeholders の名前で行う。
 */

export type JobConditionField = {
  key: string;
  label: string;
  group: string;
  /** プルダウンの選択肢 (求人テンプレートの ▼ と同じ) */
  options?: readonly string[];
  multiline?: boolean;
  /** 求人票 (Google ドキュメント) の {{差し込み名}}。label 以外にも受け付ける名前 */
  placeholders?: string[];
};

const PAY_SHARE = ["会社負担", "本人負担", "一部負担"] as const;

export const JOB_CONDITION_GROUPS = ["基本情報", "応募条件", "労働条件", "給与", "寮", "サポート", "海外からの応募", "その他"] as const;

export const JOB_CONDITION_FIELDS: JobConditionField[] = [
  { key: "employmentType", label: "雇用形態", group: "基本情報", options: ["特定技能", "技術・人文知識・国際業務"] },
  { key: "field", label: "分野", group: "基本情報" },
  { key: "jobType", label: "職種", group: "基本情報" },
  { key: "jobDescription", label: "仕事内容", group: "基本情報", multiline: true },
  { key: "workLocation", label: "勤務地", group: "基本情報" },
  { key: "headcount", label: "募集人数", group: "基本情報" },
  { key: "nationality", label: "国籍", group: "基本情報" },
  { key: "gender", label: "性別", group: "基本情報", options: ["不問", "男性", "女性"] },
  { key: "preferredEntryDate", label: "入社希望時期", group: "基本情報" },

  { key: "experienceYears", label: "実務経験", group: "応募条件" },
  {
    key: "japaneseLevel",
    label: "日本語レベル",
    group: "応募条件",
    options: ["不問", "N1以上", "N2以上", "N3以上", "N4以上", "JFT-Basic合格"],
  },
  { key: "education", label: "学歴", group: "応募条件" },
  { key: "requiredQualifications", label: "免許・資格など", group: "応募条件", placeholders: ["免許・資格", "必要資格"] },

  { key: "workHours", label: "勤務時間", group: "労働条件", placeholders: ["勤務時間1"] },
  { key: "breakTime", label: "休憩", group: "労働条件" },
  { key: "overtime", label: "残業", group: "労働条件", placeholders: ["残業有無"] },
  { key: "fixedOvertime", label: "固定残業", group: "労働条件" },
  { key: "holidays", label: "休日", group: "労働条件", placeholders: ["休日詳細"] },
  { key: "transfer", label: "転勤・異動", group: "労働条件", options: ["あり", "なし"] },

  { key: "monthlyGross", label: "額面", group: "給与", placeholders: ["月総支給額"] },
  { key: "basicSalary", label: "基本給", group: "給与" },
  { key: "allowances", label: "手当", group: "給与", multiline: true },
  { key: "expectedTakeHome", label: "予想の手取り", group: "給与", placeholders: ["手取り"] },
  { key: "bonus", label: "賞与", group: "給与", placeholders: ["賞与有無"] },
  { key: "salaryIncrease", label: "昇給", group: "給与", placeholders: ["昇給有無"] },

  { key: "dormProvision", label: "寮の有無", group: "寮", options: ["あり", "なし"], placeholders: ["寮有無", "寮費有無"] },
  { key: "dormAmount", label: "家賃", group: "寮", placeholders: ["寮費", "寮費金額"] },
  { key: "roomType", label: "部屋タイプ", group: "寮" },
  { key: "dormCommuteTime", label: "通勤時間", group: "寮", placeholders: ["寮から通勤時間"] },
  { key: "commuteMethod", label: "通勤手段", group: "寮" },

  { key: "movingSupport", label: "引っ越し手当", group: "サポート", placeholders: ["引越補助有無"] },
  { key: "ssw2Support", label: "特定技能2号", group: "サポート", options: ["支援あり", "支援なし"] },
  { key: "visaCostCoverage", label: "ビザ申請の費用支給", group: "サポート", options: PAY_SHARE },

  { key: "overseasApplication", label: "海外からの応募可否", group: "海外からの応募", options: ["可", "不可"], placeholders: ["応募可否", "海外応募可否"] },
  { key: "travelCostCoverage", label: "渡航費の負担", group: "海外からの応募", options: PAY_SHARE },

  { key: "foreignWorkers", label: "外国人材の採用実績", group: "その他", placeholders: ["外国人就業者"] },
  { key: "reference", label: "参考", group: "その他", multiline: true },
  { key: "notes", label: "特記事項", group: "その他", multiline: true, placeholders: ["備考"] },
  { key: "memo", label: "メモ（社内用。求人票には出しません）", group: "その他", multiline: true },
];

export type ConditionsRecord = Record<string, string | null | undefined>;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const join = (parts: string[], sep: string) => parts.filter(Boolean).join(sep);

/**
 * 以前の項目から新しい項目の初期値を作る。新しい項目に値があればそちらを優先 (上書きしない)。
 * 選択肢のある項目は、以前の書き方 (有/無 など) を選択肢の表記に揃える。
 */
export function migrateLegacyConditions(input: ConditionsRecord | null | undefined): ConditionsRecord {
  const c: ConditionsRecord = { ...(input ?? {}) };
  const fill = (key: string, value: string) => {
    if (!s(c[key]) && value) c[key] = value;
  };
  // 勤務時間: 勤務開始/終了 1・2 → 「8:00〜17:00 / 20:00〜5:00」
  fill(
    "workHours",
    join(
      [join([s(c.workTime1Start), s(c.workTime1End)], "〜"), join([s(c.workTime2Start), s(c.workTime2End)], "〜")],
      " / ",
    ),
  );
  // 残業: 有無 + 月平均
  if (s(c.avgMonthlyOvertime) && !/平均/.test(s(c.overtime))) {
    fill("overtime", join([s(c.overtime), `月平均 ${s(c.avgMonthlyOvertime)}`], "・"));
  }
  // 固定残業: 時間 + 金額
  fill("fixedOvertime", join([s(c.fixedOvertimeHours) && `${s(c.fixedOvertimeHours)}時間`, s(c.fixedOvertimePay) && `${s(c.fixedOvertimePay)}円`], " / "));
  // 手当: 皆勤・住宅・深夜・通勤・その他
  fill(
    "allowances",
    join(
      [
        s(c.perfectAttendance) && `皆勤手当 ${s(c.perfectAttendance)}`,
        s(c.housingAllowance) && `住宅手当 ${s(c.housingAllowance)}`,
        s(c.nightShiftAllowance) && `深夜手当 ${s(c.nightShiftAllowance)}`,
        s(c.commuteAllowance) && `通勤手当 ${s(c.commuteAllowance)}`,
        s(c.otherBenefits),
      ],
      "\n",
    ),
  );
  // 部屋タイプ: 寝室共有 + 寮人数
  fill("roomType", join([/有|あり|共有/.test(s(c.bedroomShared)) ? "相部屋" : s(c.bedroomShared) ? "個室" : "", s(c.dormOccupants) && `${s(c.dormOccupants)}人`], "・"));
  // 引っ越し手当: 有無 + 詳細
  if (s(c.movingSupportDetails)) fill("movingSupport", join([s(c.movingSupport), s(c.movingSupportDetails)], "・"));
  // 選択肢の表記ゆれを揃える
  const yesNo = (v: string) => (/^(有|あり|有り|○)$/.test(v) ? "あり" : /^(無|なし|無し|×)$/.test(v) ? "なし" : v);
  if (s(c.dormProvision)) c.dormProvision = yesNo(s(c.dormProvision));
  if (s(c.gender)) c.gender = s(c.gender).replace(/^男$/, "男性").replace(/^女$/, "女性");
  if (s(c.overseasApplication)) c.overseasApplication = s(c.overseasApplication).replace(/^(○|有|あり|OK)$/i, "可").replace(/^(×|無|なし|NG)$/i, "不可");
  return c;
}

/** 求人票 (Google ドキュメント) の差し込み名 → 値。項目名そのもの + placeholders で受け付ける */
export function conditionPlaceholders(conditions: ConditionsRecord): Record<string, string> {
  const c = migrateLegacyConditions(conditions);
  const out: Record<string, string> = {};
  for (const f of JOB_CONDITION_FIELDS) {
    if (f.key === "memo") continue; // 社内メモは求人票に出さない
    const v = s(c[f.key]);
    if (!v) continue;
    for (const name of [f.label, ...(f.placeholders ?? [])]) out[name] = v;
  }
  return out;
}
