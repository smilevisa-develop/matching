/**
 * Google Drive URL ヘルパー。
 *
 * Drive のシェア URL は <img src> から読めないので、サムネ URL に変換する。
 *   入力: https://drive.google.com/open?id=XXX
 *        https://drive.google.com/file/d/XXX/view
 *        https://drive.google.com/file/d/XXX/view?usp=sharing
 *   出力: https://drive.google.com/thumbnail?id=XXX&sz=w400
 *
 * 既にサムネ URL ならそのまま返す (二重変換しない)。
 */

const FILE_ID_PATTERN = /[a-zA-Z0-9_-]+/;

/** URL から Drive ファイル ID を抽出 (取れなければ null) */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  // /file/d/{id}/...
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id=XXX or &id=XXX (open, uc, thumbnail 全部対応)
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

/**
 * 任意の Drive URL を <img> で読めるサムネ URL に変換。
 *   - 既にサムネ URL ならそのまま返す
 *   - ID 抽出できない URL は null を返す (= 変換不能なので photoUrl にしてはいけない)
 */
export function toDriveThumbUrl(url: string | null | undefined, size: number = 400): string | null {
  if (!url) return null;
  // 既にサムネ URL ならそのまま
  if (url.includes("drive.google.com/thumbnail?")) return url;
  const id = extractDriveFileId(url);
  if (!id) return null;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}
