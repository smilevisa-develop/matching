/**
 * 「人材紹介KPI」スプシの「自動転記」タブへ、月の実績を書き込む。
 *
 * 採用チームの依頼 (2026/10): 目標・実績・面談数・推薦数・内定数・入社数・求人数を KPI シートに自動反映。
 * 「自動転記」タブは「データ」タブのコピーで、系からの転記はこちらだけに書く
 * (手入力の「データ」タブと両方を並行運用する。手入力の値は消さない)。
 *
 * タブの形 (2026/10 時点):
 *   行 4   … 各月の 1 日の日付 (C4=2026/02/01, G4=2026/03/01 … 4 列ごと)
 *   行 5   … 目標 / 実績 / 達成率 (月ごとに 3 列 + 空き 1 列)
 *   B 列   … 行の見出し (成約数 / 売上 / リード数（候補者獲得数） / 事前面談数 / 推薦数 / 内定数 / 入社人数 / 求人数)
 * 列も行も「見出しの文字」で探すので、位置が多少変わっても追従する。見出しが無い項目は書かない。
 *
 * 書く内容 (月ごと):
 *   成約数 目標 … 設定 → 月次目標 の内定者数        成約数 実績 … 内定承諾の人数
 *   売上 目標   … 設定 → 月次目標 の売上
 *   リード数 … 追加した候補者数   事前面談数 / 推薦数 / 内定数 … カンバンの日付で数えた人数
 *   入社人数 … 入社日がその月     求人数 … 受け付けた案件数
 *   達成率・転換率は数式のまま触らない
 *
 * 書く月: KPI_SYNC_FROM_MONTH 以降だけ。それより前の月はカンバンの日付が無く 0 になるため、
 * 手入力されている過去の数字を消さない。
 */

import { getCoreSettings } from "@/lib/app-settings";
import { computeMonthStats, currentMonthJst, isMonthKey, shiftMonth } from "@/lib/month-stats";
import { getSheetsClient, parseSheetIdFromUrl, serialToDateString } from "@/lib/sheets-sync";

export const DEFAULT_KPI_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1DLgNVhrsVuGu4xTk9LXa_2rspt7hfR1w0ZDUPrCG6oU/edit";
export const KPI_SHEET_TAB = "自動転記";
/** この月より前は書かない (カンバンの日付を記録し始めた月) */
export const KPI_SYNC_FROM_MONTH = "2026-10";

export function resolveKpiSpreadsheetId(): string | null {
  const url = process.env.KPI_SHEET_URL?.trim() || DEFAULT_KPI_SHEET_URL;
  return parseSheetIdFromUrl(url);
}

const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** B 列の見出し → 書く値の種類 */
type RowKey = "成約数" | "売上" | "リード数" | "事前面談数" | "推薦数" | "内定数" | "入社人数" | "求人数";
const ROW_LABELS: { key: RowKey; match: (label: string) => boolean }[] = [
  { key: "成約数", match: (l) => l === "成約数" },
  { key: "売上", match: (l) => l === "売上" },
  { key: "リード数", match: (l) => l.startsWith("リード数") },
  { key: "事前面談数", match: (l) => l === "事前面談数" },
  { key: "推薦数", match: (l) => l === "推薦数" },
  { key: "内定数", match: (l) => l === "内定数" },
  { key: "入社人数", match: (l) => l === "入社人数" || l === "入社数" },
  { key: "求人数", match: (l) => l === "求人数" },
];

export type KpiSyncResult = {
  month: string;
  tab: string;
  apply: boolean;
  skipped?: string;
  /** 書いた (書く予定の) セル */
  cells: { range: string; label: string; value: number | string }[];
};

/** セルの生値 (日付シリアル or 文字列) → "YYYY-MM" */
function cellToMonth(v: unknown): string | null {
  if (typeof v === "number") {
    const ymd = serialToDateString(v);
    return ymd ? ymd.slice(0, 7) : null;
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})[/-](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export async function syncKpiSheet(args: { month: string; apply: boolean }): Promise<KpiSyncResult> {
  const { month, apply } = args;
  const base: KpiSyncResult = { month, tab: KPI_SHEET_TAB, apply, cells: [] };
  if (!isMonthKey(month)) return { ...base, skipped: "月の形式が不正 (YYYY-MM)" };
  if (month < KPI_SYNC_FROM_MONTH) return { ...base, skipped: `${KPI_SYNC_FROM_MONTH} より前の月は書かない (手入力を消さないため)` };
  const spreadsheetId = resolveKpiSpreadsheetId();
  if (!spreadsheetId) return { ...base, skipped: "KPI シートの ID を解決できません" };

  const sheets = await getSheetsClient();
  const [headerRes, labelRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quote(KPI_SHEET_TAB)}!A1:BZ6`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(KPI_SHEET_TAB)}!B1:B60` }),
  ]);
  const headerRows = headerRes.data.values ?? [];
  // 月の行 = 日付が 2 つ以上並んでいる行 (通常 4 行目)
  let monthRow = -1;
  let col = -1;
  for (let r = 0; r < headerRows.length; r++) {
    const months = headerRows[r].map(cellToMonth);
    if (months.filter(Boolean).length < 2) continue;
    monthRow = r;
    col = months.indexOf(month);
    break;
  }
  if (monthRow < 0) return { ...base, skipped: "月の見出し行 (日付が並ぶ行) が見つかりません" };
  if (col < 0) return { ...base, skipped: `「${KPI_SHEET_TAB}」に ${month} の列がありません` };

  const labels = (labelRes.data.values ?? []).map((r) => String(r?.[0] ?? "").trim());
  const rowOf = (key: RowKey): number => {
    const def = ROW_LABELS.find((d) => d.key === key)!;
    const idx = labels.findIndex((l) => l && def.match(l));
    return idx; // 0 始まり (= 行番号 - 1)
  };

  const [stats, settings] = await Promise.all([computeMonthStats(month), getCoreSettings()]);
  const target = settings.monthlyTargets.find((t) => t.month === month);

  const targetCol = colLetter(col); // 目標
  const actualCol = colLetter(col + 1); // 実績
  const cells: KpiSyncResult["cells"] = [];
  const put = (key: RowKey, column: string, value: number | null | undefined, label: string) => {
    if (value === null || value === undefined) return;
    const r = rowOf(key);
    if (r < 0) return;
    cells.push({ range: `${column}${r + 1}`, label, value });
  };
  put("成約数", targetCol, target?.offer ?? null, "成約数 目標 (設定の内定者数)");
  put("成約数", actualCol, stats.accepted, "成約数 実績 (内定承諾)");
  put("売上", targetCol, target?.revenue ?? null, "売上 目標");
  put("リード数", actualCol, stats.leads, "リード数 (追加した候補者)");
  put("事前面談数", actualCol, stats.preInterviewed, "事前面談数");
  put("推薦数", actualCol, stats.recommended, "推薦数");
  put("内定数", actualCol, stats.offers, "内定数");
  put("入社人数", actualCol, stats.joined, "入社人数");
  put("求人数", actualCol, stats.newDeals, "求人数");

  if (apply && cells.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: cells.map((c) => ({ range: `${quote(KPI_SHEET_TAB)}!${c.range}`, values: [[c.value]] })),
      },
    });
  }
  return { ...base, cells };
}

let running: Promise<void> | null = null;
let rerun = false;

/**
 * 今月 (と、月初 3 日間は前月も) を書く。同時に何本も走らないよう 1 本にまとめる。
 * 失敗しても投げない (保存の応答を止めないため)。
 */
export function requestKpiSheetSync(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      try {
        const month = currentMonthJst();
        const months = [month];
        const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", day: "2-digit" }).format(new Date()));
        if (day <= 3) months.push(shiftMonth(month, -1));
        for (const m of months) {
          const r = await syncKpiSheet({ month: m, apply: true });
          if (r.skipped) console.info("KPI シート転記をスキップ:", m, r.skipped);
        }
      } catch (e) {
        console.warn("KPI シート転記に失敗:", e instanceof Error ? e.message : e);
      }
    } while (rerun);
  })().finally(() => {
    running = null;
  });
  return running;
}
