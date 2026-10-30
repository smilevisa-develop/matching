/**
 * 内定者管理 (アプリ) の内容を、企業データベース (スプシ) の「内定者管理」タブに反映する。
 *
 * アプリが正で、スプシはバックアップ (2026/10 土田さん。ほかの同期も同じ)。
 *   - A 列に候補者ID (4 桁ゼロ埋め) がある行だけ、アプリの値で上書きする。「IDなし」の古い行は触らない
 *   - 列は見出しの文字で探す。違うセルだけ書く (日付は 2026/8/19 と 2026/08/19 を同じとみなす)
 *   - 書かない列: B〜F (関数)、進捗ステータス・次回確認日・6か月後の状況・相談したいこと・次アクション (アプリで入れていない)
 *   - 行の追加・削除はしない (行を足すのは candidate-date-sheet.ts の、カンバンで内定にしたときだけ)
 *
 * 呼び出し元: 内定者のカード・候補者詳細の進捗を保存したとき (after())、毎時の全件同期・「同期」ボタン
 */

import { prisma } from "@/lib/prisma";
import { resolveCompanyMasterSpreadsheetId } from "@/lib/company-master-sync";
import { getSheetsClient } from "@/lib/sheets-sync";
import { OFFER_SHEET_TAB, sheetPersonId } from "@/lib/candidate-date-sheet";
import { DECLINED_STAGE, HOLD_STAGE, PRE_OFFER_STAGE, resolveStage } from "@/lib/onboarding-flow";

export type OnboardingSheetChange = { cell: string; id: string; header: string; from: string; to: string };
export type OnboardingSheetSyncResult = { changes: OnboardingSheetChange[]; skippedIds: string[]; error: string | null };

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

/** 日本時間の日付をスプシの表記 (YYYY/MM/DD) に */
const sheetYmd = (d: Date | null) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "/") : "");

/** 比べるときの形 (日付は 0 埋めをそろえる) */
function norm(v: string): string {
  const t = v.trim();
  const m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}` : t;
}

/** 書類集めより先へ進んだら「済」(キャンセル・内定辞退は書かない) */
const FILE_DONE_STAGES = new Set(["prepare", "applying", "card_processing", "card_issued", "support", "joined", "billing"]);

type Row = {
  personId: number | null;
  stage: string | null;
  heldFromStage: string | null;
  applicationType: string | null;
  applicantName: string | null;
  applicationMethod: string | null;
  offerAt: Date | null;
  offerAcceptedAt: Date | null;
  applicationPlannedAt: Date | null;
  applicationAt: Date | null;
  applicationResultAt: Date | null;
  entryAt: Date | null;
  returnHomeAt: Date | null;
  joinPlannedAt: Date | null;
  joinAt: Date | null;
  currentAction: string | null;
  person: { resumeProfile: { visaExpiryDate: string | null } | null } | null;
};

/** 見出し → その内定者の値 (undefined はその列を書かない) */
const COLUMNS: Record<string, (p: Row) => string | undefined> = {
  申請種別: (p) => p.applicationType ?? "",
  申請者: (p) => p.applicantName ?? "",
  内定日: (p) => sheetYmd(p.offerAt),
  内定承諾日: (p) => sheetYmd(p.offerAcceptedAt),
  申請予定日: (p) => sheetYmd(p.applicationPlannedAt),
  ファイル回収: (p) => {
    if (p.stage === PRE_OFFER_STAGE) return "未";
    const stage = resolveStage(p) === HOLD_STAGE ? p.heldFromStage ?? "" : resolveStage(p);
    if (stage === "card_cancelled" || stage === DECLINED_STAGE) return undefined;
    return FILE_DONE_STAGES.has(stage) ? "済" : "未";
  },
  申請日: (p) => sheetYmd(p.applicationAt),
  // 在留カードの期限。無くて「認定」(海外から来る人) なら「*」(シートの書き方に合わせる)
  "在留期日（申請前）": (p) => norm(p.person?.resumeProfile?.visaExpiryDate ?? "") || (p.applicationType === "認定" ? "*" : ""),
  申請結果日: (p) => sheetYmd(p.applicationResultAt),
  申請結果受け取り: (p) => p.applicationMethod?.match(/受取[:：]\s*([^/／]+)/)?.[1]?.trim() ?? "",
  一時帰国日: (p) => sheetYmd(p.returnHomeAt),
  入国日: (p) => sheetYmd(p.entryAt),
  入社予定日: (p) => sheetYmd(p.joinPlannedAt),
  入社日: (p) => sheetYmd(p.joinAt),
  現在の対応内容: (p) => p.currentAction ?? "",
};

export async function runOnboardingSheetSync({ apply }: { apply: boolean }): Promise<OnboardingSheetSyncResult> {
  const result: OnboardingSheetSyncResult = { changes: [], skippedIds: [], error: null };
  try {
    const spreadsheetId = resolveCompanyMasterSpreadsheetId();
    if (!spreadsheetId) return { ...result, error: "企業データベースのスプシIDが未設定" };
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${quote(OFFER_SHEET_TAB)}!A1:AZ2000` });
    const rows = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));

    const headerRow = rows.slice(0, 10).findIndex((r) => r.some((c) => c.trim() === "内定日"));
    if (headerRow < 0) return { ...result, error: "「内定者管理」に見出し「内定日」が無い" };
    const head = rows[headerRow].map((c) => c.trim());
    const cols = Object.keys(COLUMNS)
      .map((h) => ({ h, i: head.indexOf(h) }))
      .filter((c) => c.i >= 0);

    const placements = await prisma.personPlacement.findMany({
      where: { personId: { not: null } },
      select: {
        personId: true,
        stage: true,
        heldFromStage: true,
        applicationType: true,
        applicantName: true,
        applicationMethod: true,
        offerAt: true,
        offerAcceptedAt: true,
        applicationPlannedAt: true,
        applicationAt: true,
        applicationResultAt: true,
        entryAt: true,
        returnHomeAt: true,
        joinPlannedAt: true,
        joinAt: true,
        currentAction: true,
        person: { select: { resumeProfile: { select: { visaExpiryDate: true } } } },
      },
    });
    const byId = new Map(placements.map((p) => [sheetPersonId(p.personId!), p]));

    for (let r = headerRow + 1; r < rows.length; r++) {
      const raw = (rows[r][0] ?? "").trim();
      if (!/^\d+$/.test(raw)) continue;
      const id = raw.padStart(4, "0");
      const p = byId.get(id);
      if (!p) {
        result.skippedIds.push(id);
        continue;
      }
      for (const { h, i } of cols) {
        const to = COLUMNS[h](p);
        if (to === undefined) continue;
        const from = rows[r][i] ?? "";
        if (norm(from) === norm(to)) continue;
        result.changes.push({ cell: `${colLetter(i)}${r + 1}`, id, header: h, from, to });
      }
    }

    if (apply && result.changes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: result.changes.map((c) => ({ range: `${quote(OFFER_SHEET_TAB)}!${c.cell}`, values: [[c.to]] })),
        },
      });
    }
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : "error";
    console.warn("内定者管理 (スプシ) への同期に失敗:", error);
    return { ...result, error };
  }
}

let running: Promise<OnboardingSheetSyncResult> | null = null;
let rerunRequested = false;

/** 同期を依頼する。実行中なら終わったあとにもう 1 回だけ走らせる (連続で保存しても 1 回にまとめる) */
export function requestOnboardingSheetSync(): Promise<OnboardingSheetSyncResult> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    let last: OnboardingSheetSyncResult;
    do {
      rerunRequested = false;
      last = await runOnboardingSheetSync({ apply: true });
    } while (rerunRequested);
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}
