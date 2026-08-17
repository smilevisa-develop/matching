/**
 * 内定後の「事前確認資料」を候補者に理解してもらうための処理。
 *
 * 企業から届いた資料 (会社の考え方・特定技能生ルールなど) を
 *   1. セクションに分割し (splitDocumentIntoSections)
 *   2. 母国語へ翻訳して (translateDocumentSections)
 *   3. 母国語 + 日本語を並べて候補者に読んでもらう
 * という流れで使う。
 *
 * 求人票チェックリスト (lib/job-checklist.ts) と似ているが、入力が
 * 「構造化された求人条件」ではなく「自由文の資料」である点が違う。
 */

import { generateContentRotating } from "./gemini-keys";
import {
  CHECKLIST_LANGUAGES,
  nationalityToLanguage,
  type ChecklistLanguage,
} from "./job-checklist";

// 言語の一覧と国籍からの推定は求人票チェックリストと共通のものを使う
export { CHECKLIST_LANGUAGES, nationalityToLanguage };
export type { ChecklistLanguage };

/** セクションの扱い方 */
export type SectionKind =
  /** 会社の考え方・理念。正誤が無いので読むだけ (チェック不要) */
  | "read"
  /** ルール・条件。誤解すると後で揉めるのでチェックしてもらう */
  | "check";

/** 分割された日本語セクション */
export type DocumentSection = {
  key: string;
  title: string;
  body: string;
  kind: SectionKind;
};

/** 母国語訳を合わせた配信用セクション */
export type DocumentDeliveryItem = DocumentSection & {
  trTitle: string;
  trBody: string;
};

const LANG_NAME: Record<ChecklistLanguage, string> = {
  vi: "ベトナム語 (Tiếng Việt)",
  id: "インドネシア語 (Bahasa Indonesia)",
  my: "ミャンマー語 (ဗမာစာ)",
  ne: "ネパール語 (Nepali)",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toKind(v: unknown): SectionKind {
  return v === "read" ? "read" : "check";
}

/** 記号・空白を除いた文字数 (分割で本文が欠けていないかの確認に使う) */
function contentLength(text: string): number {
  return text.replace(/[\s　、。・（）()「」【】,.:：]/g, "").length;
}

const SPLIT_PROMPT = `あなたは、日本で働く外国人に会社の資料を説明する担当者です。
渡された資料を、候補者が 1 つずつ読んで確認できるセクションに分割してください。

# 分割のルール
- 資料に元からある見出し (「① お客様を一番大切にします」「6．残業」など) をそのままセクションの区切りにする。
- **本文は要約・省略・言い換えをせず、原文をそのまま入れる**。箇条書きは改行で保持する。
- 見出しが無いまとまりには、内容が分かる短い見出しを付ける。
- 1 セクションが長くなりすぎる場合 (目安 600 文字超) は、意味の切れ目で分ける。

# kind の判定
各セクションを次のどちらかに分類する。
- "read"  … 会社の考え方・理念・あいさつなど。正誤が無く、読んで共感してもらう部分。
- "check" … ルール・条件・金額・手続きなど。誤解すると後でトラブルになる部分。
            勤務ルール / 作業の決まり / 配属 / 移動 / 休日 / 残業 / 住宅 / 帰国 /
            試験支援 / 賞与 などは必ず "check" にする。

# key
半角英数字とアンダースコアの短い識別子 (例: rule_overtime, value_customer_first)。重複させない。

# 出力
指定スキーマの JSON のみ。説明やコードブロックは不要。`;

const SPLIT_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          kind: { type: "string" },
        },
        required: ["key", "title", "body", "kind"],
      },
    },
  },
  required: ["sections"],
} as const;

/**
 * 資料の本文をセクションに分割する。
 * 本文が大きく欠けた場合は警告を返す (AI が要約してしまうことがあるため)。
 */
export async function splitDocumentIntoSections(
  sourceText: string,
): Promise<{ sections: DocumentSection[]; warning: string | null }> {
  const text = sourceText.trim();
  if (!text) throw new Error("資料の本文が空です");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const response = await generateContentRotating({
    model,
    contents: [{ role: "user", parts: [{ text: `${SPLIT_PROMPT}\n\n# 資料\n${text}` }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: SPLIT_SCHEMA as unknown as Record<string, unknown>,
      // 原文を保持させたいので揺らぎは最小にする
      temperature: 0,
    },
  });

  const raw = response.text?.trim() ?? "";
  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("分割結果を JSON として解釈できませんでした");
    parsed = JSON.parse(m[0]);
  }

  const used = new Set<string>();
  const sections: DocumentSection[] = [];
  for (const s of Array.isArray(parsed.sections) ? parsed.sections : []) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const title = str(o.title);
    const body = str(o.body);
    if (!title && !body) continue;
    // key の重複は連番で回避する (チェック状態の取り違えを防ぐ)
    let key = str(o.key).replace(/[^A-Za-z0-9_]/g, "") || `sec_${sections.length + 1}`;
    if (used.has(key)) key = `${key}_${sections.length + 1}`;
    used.add(key);
    sections.push({ key, title, body, kind: toKind(o.kind) });
  }
  if (sections.length === 0) throw new Error("セクションを 1 つも取り出せませんでした");

  // 要約されて本文が落ちていないかを確認する
  const srcLen = contentLength(text);
  const outLen = contentLength(sections.map((s) => `${s.title}${s.body}`).join(""));
  const ratio = srcLen > 0 ? outLen / srcLen : 1;
  const warning =
    ratio < 0.8
      ? `原文の約 ${Math.round(ratio * 100)}% しか取り込めていません。長い資料は分けて登録するか、分割し直してください。`
      : null;

  return { sections, warning };
}

/**
 * セクションを母国語へ翻訳する。
 *
 * 資料の日本語は「自ら気づき、自ら行動します」のように抽象的なことが多く、
 * 直訳すると母国語で意味が通らない。そこで
 *   ① まずやさしい日本語に言い換える → ② その意味を訳す
 * という二段構えを指示している。
 */
export async function translateDocumentSections(
  sections: DocumentSection[],
  language: ChecklistLanguage,
): Promise<DocumentDeliveryItem[]> {
  if (sections.length === 0) return [];
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const langName = LANG_NAME[language];

  const prompt = `あなたは、日本で働く外国人に会社の資料を説明する翻訳者です。
次の日本語のセクションを ${langName} に翻訳してください。

# 翻訳の手順 (重要)
1. まず日本語を「やさしい日本語」に言い換える。
   抽象的な言い回し (例:「自ら気づき、自ら行動します」) は、
   具体的に何をすることなのかが分かる表現に直す。
2. その意味を ${langName} に訳す。日本語の語順をなぞった直訳にしない。

# ルール
- 金額・時間・日数・回数は必ずそのまま保持する (例: 20,000円 / 6ヶ月前 / 月1日)。
- 事実を変えない。ルールを緩めたり厳しくしたりしない。
- 読むのは日本語がまだ得意でない人なので、短い文に区切る。
- 箇条書きは箇条書きのまま訳す (改行を保持)。
- 各セクションの「見出し(title)」と「本文(body)」の両方を訳す。
- 出力は指定スキーマの JSON のみ。説明やコードブロックは不要。

# 入力
${JSON.stringify(
  sections.map((s) => ({ key: s.key, title: s.title, body: s.body })),
  null,
  2,
)}

# 出力スキーマ
{ "sections": [ { "key": "...", "title": "(${langName}の見出し)", "body": "(${langName}の本文)" } ] }`;

  const response = await generateContentRotating({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const raw = response.text?.trim() ?? "";
  let parsed: { sections?: { key?: string; title?: string; body?: string }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("翻訳結果を JSON として解釈できませんでした");
    parsed = JSON.parse(m[0]);
  }

  const trByKey = new Map<string, { title: string; body: string }>();
  for (const t of parsed.sections ?? []) {
    if (t && typeof t.key === "string") {
      trByKey.set(t.key, { title: str(t.title), body: str(t.body) });
    }
  }
  // 日本語の順序を保ち、訳が欠けたセクションは日本語のまま出す
  return sections.map((s) => {
    const tr = trByKey.get(s.key);
    return { ...s, trTitle: tr?.title || s.title, trBody: tr?.body || s.body };
  });
}

/** Json 列から読み出したセクション配列を型付けして返す */
export function parseSections(value: unknown): DocumentSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const key = str(o.key);
    if (!key) return [];
    return [{ key, title: str(o.title), body: str(o.body), kind: toKind(o.kind) }];
  });
}

/** Json 列から読み出した配信アイテムを型付けして返す */
export function parseDeliveryItems(value: unknown): DocumentDeliveryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const key = str(o.key);
    if (!key) return [];
    return [
      {
        key,
        title: str(o.title),
        body: str(o.body),
        kind: toKind(o.kind),
        trTitle: str(o.trTitle) || str(o.title),
        trBody: str(o.trBody) || str(o.body),
      },
    ];
  });
}
