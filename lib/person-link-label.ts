/**
 * 候補者へ送るリンクに添える識別ラベル (例: "ID 0012_NGUYEN VAN A")。
 *
 * 候補者が多いとき、コピーしたリンクを別の人に送ってしまう取り違えを防ぐため、
 * URL・送付文のコピーに必ず付ける。ID は Drive フォルダ名と同じ 4 桁表記
 * (lib/google-docs.ts の formatPersonIdPrefix と揃える。あちらはサーバー専用のため別に置く)。
 * 英語名が未入力なら登録名を使う。
 */
export function buildPersonLinkLabel(person: {
  id: number;
  englishName?: string | null;
  name: string;
}): string {
  const id = String(person.id).padStart(4, "0");
  const name = person.englishName?.trim() || person.name.trim();
  return `ID ${id}_${name}`;
}
