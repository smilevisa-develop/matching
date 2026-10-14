// 日本語の文字 (漢字・ひらがな・カタカナ・長音・句読点)
const JA = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー、。！？]";
const SPACE_BETWEEN_JA = new RegExp(`(${JA})[ \\u3000]+(?=${JA})`, "gu");

/**
 * 日本語の文字の間に入った空白を取り除く。
 * AI のモデルによっては「グエン と 申します」のように単語の間に空白を入れて文字起こしするため。
 * 英字や数字の前後の空白 (「N4 です」など) は残す。
 */
export function removeJapaneseSpaces(text: string): string {
  return text.replace(SPACE_BETWEEN_JA, "$1").trim();
}
