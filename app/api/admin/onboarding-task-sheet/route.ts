/**
 * 内定後タスク管理表 (スプレッドシート) を作る (要ログイン)。
 *
 * POST /api/admin/onboarding-task-sheet
 *   body: { title?: string, folderId?: string }
 *
 * 申請種別ごとにタブを分ける。各タブはその種別で必要なタスクだけが並ぶので、
 * 「対象」列を見て読み飛ばす必要がない (1 行 1 タスク、上から順にやれば終わる)。
 *   認定（海外） / 変更（国内転職） / 更新 / 特定活動
 *
 * 完了列はチェックボックス、ステータスはプルダウン、完了行はグレーになる。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { MASTER_TASKS, TASK_PHASES, type MasterTask } from "@/lib/onboarding-task-master";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEADER = [
  "No",
  "工程",
  "タスク",
  "完了",
  "ステータス",
  "期限目安\n（内定受領から）",
  "手順・ポイント",
  "必要なエビデンス",
  "実施日",
  "担当者",
  "備考",
];

const STATUS_OPTIONS = ["未着手", "対応中", "完了", "該当なし"];

/** タブ = 申請種別。その種別で必要なタスクだけを集める */
const TABS: { name: string; include: (t: MasterTask) => boolean }[] = [
  {
    name: "認定（海外）",
    include: (t) => t.target === "全員" || t.target === "認定（海外）",
  },
  {
    name: "変更（国内転職）",
    include: (t) =>
      t.target === "全員" ||
      t.target === "変更（国内転職）" ||
      t.target === "国内（変更・更新・特定活動）",
  },
  {
    name: "更新",
    include: (t) =>
      t.target === "全員" || t.target === "更新" || t.target === "国内（変更・更新・特定活動）",
  },
  {
    name: "特定活動",
    include: (t) =>
      t.target === "全員" || t.target === "特定活動" || t.target === "国内（変更・更新・特定活動）",
  },
];

function tasksFor(include: (t: MasterTask) => boolean) {
  return MASTER_TASKS.filter(include).sort((a, b) => {
    const pa = TASK_PHASES.indexOf(a.phase);
    const pb = TASK_PHASES.indexOf(b.phase);
    return pa - pb || a.dueDays - b.dueDays;
  });
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "内定後タスク管理表");
    const parentId =
      typeof body?.folderId === "string" && body.folderId
        ? body.folderId
        : "1Pmv-hFyk8DKIuu24mtMS5c26DWXmjqXr"; // 候補者ルート

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    await auth.authorize();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // 1) 指定フォルダに空のスプレッドシートを作る
    //    (Sheets API の create はサービスアカウントのマイドライブに作られてしまい、
    //     そこから移動する権限が無いため、Drive API でフォルダ内に直接作る)
    const created = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: title,
        parents: [parentId],
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
      fields: "id,webViewLink,name",
    });
    const spreadsheetId = created.data.id!;

    // 2) タブを作る (既定の「シート1」は最後に消す)
    const base = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title))",
    });
    const defaultSheetId = base.data.sheets?.[0]?.properties?.sheetId ?? 0;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: TABS.map((tab, i) => ({
          addSheet: { properties: { sheetId: i + 1, title: tab.name, index: i } },
        })),
      },
    });

    // 3) 各タブに値を書く
    const counts: Record<string, number> = {};
    const valueData = TABS.map((tab) => {
      const list = tasksFor(tab.include);
      counts[tab.name] = list.length;
      const rows = list.map((t, i) => [
        i + 1,
        t.phase,
        t.title,
        false, // 完了 (チェックボックス)
        "未着手",
        `${t.dueDays}日後`,
        t.howto,
        t.evidence,
        "",
        "",
        t.problem ? `※過去の問題: ${t.problem}` : "",
      ]);
      return { range: `'${tab.name}'!A1`, values: [HEADER, ...rows] };
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: valueData },
    });

    // 4) 体裁 (タブごとに同じ設定)
    const requests: Record<string, unknown>[] = [];
    TABS.forEach((tab, index) => {
      const sheetId = index + 1;
      const lastRow = counts[tab.name] + 1;
      requests.push(
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.95, blue: 0.92 },
                wrapStrategy: "WRAP",
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 } },
            fields: "gridProperties(frozenRowCount,frozenColumnCount)",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: lastRow },
            cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
            fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
          },
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 3, endColumnIndex: 4 },
            rule: { condition: { type: "BOOLEAN" }, strict: true },
          },
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 4, endColumnIndex: 5 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: STATUS_OPTIONS.map((v) => ({ userEnteredValue: v })),
              },
              showCustomUi: true,
              strict: false,
            },
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [
                { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 0, endColumnIndex: HEADER.length },
              ],
              booleanRule: {
                condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=$D2=TRUE" }] },
                format: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                  textFormat: { foregroundColor: { red: 0.6, green: 0.6, blue: 0.6 } },
                },
              },
            },
            index: 0,
          },
        },
      );
      const widths: [number, number][] = [
        [0, 45],
        [1, 150],
        [2, 320],
        [3, 55],
        [4, 95],
        [5, 110],
        [6, 340],
        [7, 190],
        [8, 90],
        [9, 90],
        [10, 260],
      ];
      for (const [i, size] of widths) {
        requests.push({
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: size },
            fields: "pixelSize",
          },
        });
      }
    });
    // 既定の空シートを削除する
    requests.push({ deleteSheet: { sheetId: defaultSheetId } });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        supportsAllDrives: true,
        requestBody: { role: "writer", type: "domain", domain: "croslan.co.jp" },
      });
    } catch {
      // ドメイン共有ができない場合はフォルダの共有設定に従う
    }

    return Response.json({
      ok: true,
      title,
      url: created.data.webViewLink,
      tabs: counts,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
