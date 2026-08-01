/**
 * 母国語の求人票チェックリスト。
 *
 * 求人(Deal.conditions)の要点だけを抜き出し、候補者の母国語＋日本語の対訳にする。
 * 候補者は長い求人票を読まないので、要点をチェックリスト形式で確認してもらう。
 *
 * 翻訳は generateContentRotating (複数キーのローテーション) を使うので無料枠で回る。
 * 翻訳結果は配信レコードにスナップショットとして保存し、再送しても再翻訳しない。
 *
 * 必要書類は要点に含めない (運用方針)。
 */

import { generateContentRotating } from "./gemini-keys";

export type ChecklistLanguage = "vi" | "id" | "my" | "ne";

export const CHECKLIST_LANGUAGES: { code: ChecklistLanguage; label: string; native: string }[] = [
  { code: "vi", label: "ベトナム語", native: "Tiếng Việt" },
  { code: "id", label: "インドネシア語", native: "Bahasa Indonesia" },
  { code: "my", label: "ミャンマー語", native: "မြန်မာ" },
  { code: "ne", label: "ネパール語", native: "नेपाली" },
];

/** 国籍からデフォルト言語を推定 */
export function nationalityToLanguage(nationality: string | null | undefined): ChecklistLanguage {
  const n = (nationality ?? "").trim();
  if (/ベトナム|viet/i.test(n)) return "vi";
  if (/インドネシア|indonesia/i.test(n)) return "id";
  if (/ミャンマー|myanmar|burm/i.test(n)) return "my";
  if (/ネパール|nepal/i.test(n)) return "ne";
  return "vi";
}

/** 求人の要点 1 項目 (日本語) */
export type JaKeyPoint = { key: string; jaLabel: string; jaValue: string };
/** 対訳済みの要点 1 項目 */
export type ChecklistItem = JaKeyPoint & { trLabel: string; trValue: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}
function joinNonEmpty(parts: string[], sep: string): string {
  return parts.filter((p) => p && p.length > 0).join(sep);
}

/** 金額に円と桁区切りを付ける。数字だけなら "265,000円"、既に単位付きならそのまま。 */
function money(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const digits = s.replace(/[,，\s]/g, "");
  if (/^\d+$/.test(digits)) return `${Number(digits).toLocaleString("ja-JP")}円`;
  return s; // "月20万" 等はそのまま
}

/** 勤務地: 都道府県を先頭にする */
function formatLocation(c: Record<string, unknown>): string {
  const loc = str(c.workLocation);
  const station = str(c.nearestStation);
  let out = loc;
  const m = loc.match(/(北海道|東京都|京都府|大阪府|..[県府])/);
  if (m && !loc.startsWith(m[1])) out = `${m[1]} ${loc}`;
  return joinNonEmpty([out, station ? `最寄: ${station}` : ""], " / ");
}

/** 残業: 固定残業かどうかを明記 */
function formatOvertime(c: Record<string, unknown>): string {
  const fh = str(c.fixedOvertimeHours);
  const fp = str(c.fixedOvertimePay);
  if (fh || fp) {
    const fhLabel = fh ? (/^\d+$/.test(fh) ? `（${fh}時間ぶん）` : `（${fh}）`) : "";
    return joinNonEmpty(["固定残業あり", fhLabel, fp ? `／ ${money(fp)}` : ""], " ");
  }
  const ov = str(c.overtime);
  const avg = str(c.avgMonthlyOvertime);
  return joinNonEmpty([ov ? `固定残業なし（${ov}）` : "", avg ? `平均 ${avg}` : ""], " / ") || ov;
}

/** 寮: あり/なし＋寮費(本人負担)を円で */
function formatDorm(c: Record<string, unknown>): string {
  const prov = str(c.dormProvision);
  const amt = str(c.dormAmount);
  if (!prov && !amt) return "";
  if (/無|なし/.test(prov)) return "なし";
  const fee = amt ? `寮費 ${money(amt)}／月（本人負担）` : "";
  return joinNonEmpty([prov || "あり", fee], "・");
}

/** 食事: あり/なし＋金額を円で */
function formatMeal(c: Record<string, unknown>): string {
  const prov = str(c.mealProvision);
  const amt = str(c.mealAmount);
  if (!prov && !amt) return "";
  if (/無|なし/.test(prov)) return "なし";
  const fee = amt ? `${money(amt)}／食` : "";
  return joinNonEmpty([prov || "あり", fee], "・");
}

/** conditions(Json) から拾う要点の定義。必要書類は含めない。 */
const KEY_POINT_FIELDS: { key: string; label: string; from: (c: Record<string, unknown>) => string }[] = [
  { key: "jobDescription", label: "仕事内容", from: (c) => str(c.jobDescription) },
  { key: "workLocation", label: "勤務地（都道府県から）", from: (c) => formatLocation(c) },
  {
    // monthlyGross=額面(総支給) / basicSalary=基本給。どちらも手取りではないので明記。
    key: "salary",
    label: "月収（額面・手取りではありません）",
    from: (c) => money(str(c.monthlyGross) || str(c.basicSalary)),
  },
  {
    key: "workTime",
    label: "勤務時間",
    from: (c) => {
      const a = joinNonEmpty([str(c.workTime1Start), str(c.workTime1End)], "〜");
      const b = joinNonEmpty([str(c.workTime2Start), str(c.workTime2End)], "〜");
      return joinNonEmpty([a, b], " / ");
    },
  },
  { key: "overtime", label: "残業", from: (c) => formatOvertime(c) },
  { key: "holidays", label: "休日", from: (c) => str(c.holidays) },
  { key: "dorm", label: "寮", from: (c) => formatDorm(c) },
  { key: "meal", label: "食事", from: (c) => formatMeal(c) },
  { key: "benefits", label: "待遇・手当（有給など）", from: (c) => str(c.otherBenefits) },
  { key: "notes", label: "備考", from: (c) => str(c.notes) },
];

/** 求人の conditions から日本語の要点リストを作る (値が空の項目は除外) */
export function buildJapaneseKeyPoints(conditions: unknown): JaKeyPoint[] {
  const c = conditions && typeof conditions === "object" ? (conditions as Record<string, unknown>) : {};
  const out: JaKeyPoint[] = [];
  for (const f of KEY_POINT_FIELDS) {
    const value = f.from(c);
    if (value) out.push({ key: f.key, jaLabel: f.label, jaValue: value });
  }
  return out;
}

/** 求人情報が「要点を作れるだけ入っているか」(送信前提の判定に使う) */
export function hasEnoughJobInfo(conditions: unknown): boolean {
  return buildJapaneseKeyPoints(conditions).length >= 2;
}

const LANG_NAME: Record<ChecklistLanguage, string> = {
  vi: "ベトナム語 (Vietnamese)",
  id: "インドネシア語 (Indonesian)",
  my: "ミャンマー語 (Burmese)",
  ne: "ネパール語 (Nepali)",
};

/**
 * 日本語の要点を母国語へ翻訳して対訳リストにする。
 * 各項目のラベルと値を、やさしく明確な母国語に訳す。
 */
export async function translateChecklist(
  items: JaKeyPoint[],
  language: ChecklistLanguage,
): Promise<ChecklistItem[]> {
  if (items.length === 0) return [];
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const langName = LANG_NAME[language];

  const prompt = `あなたは外国人労働者向けの求人情報を翻訳する専門家です。
次の日本語の求人「要点」を、${langName}に翻訳してください。

# ルール
- 外国人労働者が読むので、やさしく明確な表現にする。
- 数字・金額・時間はそのまま保持する。
- 各項目の「ラベル(label)」と「値(value)」の両方を翻訳する。
- 意訳しすぎず、事実を正確に。
- 出力は指定スキーマの JSON のみ。説明やコードブロックは不要。

# 入力 (日本語の要点)
${JSON.stringify(items.map((i) => ({ key: i.key, label: i.jaLabel, value: i.jaValue })), null, 2)}

# 出力スキーマ
{ "items": [ { "key": "...", "label": "(${langName}のラベル)", "value": "(${langName}の値)" } ] }`;

  const response = await generateContentRotating({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const text = response.text?.trim() ?? "";
  let parsed: { items?: { key?: string; label?: string; value?: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("翻訳結果を JSON として解釈できませんでした");
    parsed = JSON.parse(m[0]);
  }
  const trByKey = new Map<string, { label: string; value: string }>();
  for (const t of parsed.items ?? []) {
    if (t && typeof t.key === "string") {
      trByKey.set(t.key, { label: str(t.label), value: str(t.value) });
    }
  }
  // 元の日本語順で対訳を組む (翻訳が欠けた項目は日本語で埋める)
  return items.map((i) => {
    const tr = trByKey.get(i.key);
    return {
      ...i,
      trLabel: tr?.label || i.jaLabel,
      trValue: tr?.value || i.jaValue,
    };
  });
}
