/**
 * 推薦先企業の表示・保存に使う「合体形」ラベル。
 *   企業ID_企業名  (例: "14sv_株式会社シナジー")
 * 企業ID (externalId) が無い企業は企業名のみ。
 *
 * 内定者管理・請求管理はこの文字列から企業ID (先頭の "_" より前) を取り出して
 * 管理しているため、システムが書き出す推薦先はこの形式に統一する。
 */
export function companyLabel(
  externalId: string | null | undefined,
  name: string | null | undefined,
): string {
  const id = (externalId ?? "").trim().toLowerCase();
  const nm = (name ?? "").trim();
  if (!nm) return "";
  return id ? `${id}_${nm}` : nm;
}
