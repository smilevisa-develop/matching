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
