/**
 * 日付値の正規化ヘルパー。
 *
 * 経緯: xlsx の日付セルは Excel シリアル番号 (例: 36926 = 2001-02-05) で返ってきます。
 * これを `new Date("36926")` で処理すると JS は「年 36926, 1月1日」と解釈してしまい、
 * `.toISOString().slice(0, 10)` = "+036926-12" のような broken 文字列が DB に入る。
 * (年が >= 10000 だと ISO 8601 拡張年フォーマット "+YYYYYY-MM-DD" になり、
 *  slice すると sign + 6桁年 + "-" + 月の頭2桁 で 10 文字になるため "+036926-12" になる)
 *
 * このヘルパーで:
 *   ① Excel シリアル番号 (4-6桁) を正しく "YYYY-MM-DD" に変換
 *   ② 既存の broken 文字列 ("+036926-12") から serial を取り出して再変換
 *   ③ 既に "YYYY-MM-DD" 形式ならそのまま返す
 */

/** Excel serial date を ISO YYYY-MM-DD に変換 (1900-01-01 を 1 とする慣習。1900 leap year バグ含む) */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  // Excel epoch (with 1900 leap year bug) → Unix epoch
  // Excel serial 25569 = 1970-01-01
  const ms = (serial - 25569) * 86400 * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  // year 1900-2099 のみ採用 (それ以外は明らかにおかしい)
  const y = date.getUTCFullYear();
  if (y < 1900 || y > 2099) return null;
  return date.toISOString().slice(0, 10);
}

/** "+036926-12" のような broken string から serial を抽出 (失敗時 null) */
function extractSerialFromBrokenIso(value: string): number | null {
  const m = value.match(/^\+0?(\d{4,6})-\d{2}$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 任意の日付値を ISO "YYYY-MM-DD" に正規化。変換不能なら null。
 *   - Date オブジェクト → そのまま toISOString
 *   - number → Excel serial として変換
 *   - "+036926-12" などの broken → serial 抽出して再変換
 *   - "YYYY-MM-DD" / "YYYY/MM/DD" 等の date string → 正規化
 *   - その他 → null
 */
export function normalizeToIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    return excelSerialToIsoDate(value);
  }
  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return null;

    // ① broken "+0YYYYYY-MM" パターンを優先検出
    const brokenSerial = extractSerialFromBrokenIso(str);
    if (brokenSerial !== null) {
      return excelSerialToIsoDate(brokenSerial);
    }

    // ② 4-6 桁の数値文字列は Excel serial と判定 (年として扱う 4 桁は除外)
    if (/^\d{5,6}(\.\d+)?$/.test(str)) {
      return excelSerialToIsoDate(Number(str));
    }

    // ③ 普通の日付文字列として parse 試行
    //    YYYY-MM-DD, YYYY/MM/DD, YYYY-MM-DDTHH:MM:SS 等
    //    ただし >= 10000 の年は ISO 拡張形式と区別がつかないので除外
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str)) {
      const d = new Date(str.replace(/\//g, "-"));
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        if (y >= 1900 && y <= 2099) {
          return d.toISOString().slice(0, 10);
        }
      }
    }
    return null;
  }
  return null;
}

/** broken な ISO 拡張年形式 "+0YYYYY-MM" を判別 */
export function isBrokenExtendedIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\+0?\d{4,6}-\d{2}$/.test(value);
}
