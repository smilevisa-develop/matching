/**
 * 日本語以外で書かれた短い文章に日本語訳を付ける (修正依頼など)。
 * AI は generateContentRotating (Claude → Gemini の無料枠。有料化しない方針のまま)。失敗したら null。
 */
import { generateContentRotating, getGeminiModel } from "@/lib/gemini-keys";

export function looksJapanese(s: string): boolean {
  return /[぀-ヿ]/.test(s);
}

export async function translateToJapanese(text: string): Promise<string | null> {
  const src = text.trim();
  if (!src || looksJapanese(src)) return null;
  try {
    const params = {
      model: getGeminiModel(),
      contents:
        "次の文章は、業務システムを使っている外国人スタッフが書いた修正依頼です。自然な日本語に翻訳し、訳文だけを返してください。\n\n" +
        src,
      config: { temperature: 0.2 },
    } as Parameters<typeof generateContentRotating>[0];
    const res = (await generateContentRotating(params)) as { text?: string | null };
    const out = (res.text ?? "").trim();
    return out || null;
  } catch (e) {
    console.warn("修正依頼の翻訳に失敗:", e instanceof Error ? e.message : e);
    return null;
  }
}
