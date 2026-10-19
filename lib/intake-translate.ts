/**
 * 候補者が母国語で書いた回答に、日本語訳を付ける (送信後にサーバー側で実行。失敗しても回答は残る)。
 *
 * 訳は元の回答とは別のキー `<key>__ja` に入れる (元の文章は消さない)。
 * 候補者詳細では回答の下に「日本語訳」として出す。
 * AI は generateContentRotating (Claude → Gemini の無料枠。有料化しない方針のまま)。
 */

import { generateContentRotating, getGeminiModel } from "@/lib/gemini-keys";
import { INTAKE_LANG_LABELS, type IntakeLang } from "@/lib/intake-i18n";

export const JA_SUFFIX = "__ja";

/** 日本語 (ひらがな・カタカナ・漢字) を含むか */
function looksJapanese(s: string): boolean {
  return /[぀-ヿ一-鿿]/.test(s);
}

/**
 * @param texts key → 本人の回答 (空や日本語のものは除いて渡す)
 * @returns key → 日本語訳 (訳せなかったものは含まない)
 */
export async function translateAnswersToJapanese(
  lang: IntakeLang,
  texts: Record<string, string>,
): Promise<Record<string, string>> {
  const entries = Object.entries(texts).filter(([, v]) => v.trim().length >= 2 && !looksJapanese(v));
  if (lang === "ja" || entries.length === 0) return {};
  const src = Object.fromEntries(entries);
  const prompt =
    `次の JSON は外国人の求職者が ${INTAKE_LANG_LABELS[lang]} (または英語) で書いた回答です。` +
    `各値を自然な日本語に翻訳し、同じキーで JSON だけを返してください。固有名詞・数字・金額はそのまま残してください。\n` +
    JSON.stringify(src);
  const params = {
    model: getGeminiModel(),
    contents: prompt,
    config: { responseMimeType: "application/json", temperature: 0.2 },
  } as Parameters<typeof generateContentRotating>[0];
  const res = (await generateContentRotating(params)) as { text?: string | null };
  const raw = (res.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(src)) {
    const v = parsed[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}
