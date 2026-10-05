/**
 * 推薦リストの URL 列を「ファイル名が見えるリンク」にする。
 *
 * 長い URL がそのまま並ぶと読みにくいので、Sheets / Excel の HYPERLINK 関数にして
 * 表示文字を Drive 上のファイル名 (例: 0389_MA THE HUY_履歴書) にする。
 *   =HYPERLINK("https://…","0389_MA THE HUY_履歴書")
 *
 * スマートチップ (チップ表示) ではなく HYPERLINK を使う理由:
 *   チップは閲覧者がそのファイルにアクセスできないと名前が出ない。
 *   HYPERLINK なら権限に関係なく、こちらで入れた文字がそのまま見える。
 *
 * 名前を取れなかった URL は、そのまま URL を出す (リンクが消えないことを優先)。
 */

import { extractDriveFileId } from "./drive-url";
import { getDriveItemName, parseGoogleDriveFolderId, parseGoogleFileId } from "./google-docs";

/** URL から Drive のファイル / フォルダ ID を取り出す */
function toDriveId(url: string): string | null {
  const value = url.trim();
  if (!value.startsWith("http")) return null;
  if (value.includes("/folders/")) return parseGoogleDriveFolderId(value);
  return extractDriveFileId(value) ?? parseGoogleFileId(value);
}

/** HYPERLINK 式を作る (引用符は Sheets / Excel の流儀で 2 つ重ねて escape) */
export function hyperlinkFormula(url: string, label: string): string {
  const safeUrl = url.replace(/"/g, '""');
  const safeLabel = label.replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

/**
 * URL の配列について Drive 上の名前をまとめて引く。
 * 取れなかったものは Map に入れない (呼び出し側で URL のまま出す)。
 */
export async function resolveDriveNames(urls: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter((u) => u && u.startsWith("http")))];
  const out = new Map<string, string>();
  await Promise.all(
    unique.map(async (url) => {
      const id = toDriveId(url);
      if (!id) return;
      const name = await getDriveItemName(id);
      if (name) out.set(url, name);
    }),
  );
  return out;
}

/**
 * URL セルを HYPERLINK 式にする。名前が引けなければ URL のまま返す。
 * 値が URL でない (空文字など) ときはそのまま返す。
 */
export function toLinkCell(value: string | number, names: Map<string, string>): string | number {
  if (typeof value !== "string" || !value.startsWith("http")) return value;
  const name = names.get(value);
  return name ? hyperlinkFormula(value, name) : value;
}
