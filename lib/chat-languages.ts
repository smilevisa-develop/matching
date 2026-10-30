/** チャット画面の表示言語 (画面側からも読むので、サーバー専用の依存を持たせない) */
export const CHAT_LANGUAGES = [
  { code: "ja", label: "日本語", aiName: "Japanese" },
  { code: "vi", label: "Tiếng Việt", aiName: "Vietnamese" },
  { code: "id", label: "Bahasa Indonesia", aiName: "Indonesian" },
] as const;

export type ChatLang = (typeof CHAT_LANGUAGES)[number]["code"];

export function isChatLang(v: unknown): v is ChatLang {
  return CHAT_LANGUAGES.some((l) => l.code === v);
}

/** 文字 (どの言語でも) を含むか。「.」や記号・絵文字だけなら訳さない */
export function hasWords(text: string): boolean {
  return /\p{L}/u.test(text);
}

/** 入力欄の「翻訳」で選べる言語 (送る相手の言語) */
export const DRAFT_LANGUAGES = [
  { code: "ja", label: "日本語", aiName: "Japanese" },
  { code: "vi", label: "ベトナム語", aiName: "Vietnamese" },
  { code: "id", label: "インドネシア語", aiName: "Indonesian" },
  { code: "en", label: "英語", aiName: "English" },
  { code: "my", label: "ミャンマー語", aiName: "Burmese" },
  { code: "ne", label: "ネパール語", aiName: "Nepali" },
  { code: "km", label: "クメール語", aiName: "Khmer" },
] as const;

export type DraftLang = (typeof DRAFT_LANGUAGES)[number]["code"];

export function isDraftLang(v: unknown): v is DraftLang {
  return DRAFT_LANGUAGES.some((l) => l.code === v);
}

/** 国 → 相手の言語の見当 (相手からのメッセージがまだ無いトークで使う) */
export const COUNTRY_LANG: Record<string, DraftLang> = {
  ベトナム: "vi",
  インドネシア: "id",
  ミャンマー: "my",
  ネパール: "ne",
  カンボジア: "km",
  フィリピン: "en",
};
