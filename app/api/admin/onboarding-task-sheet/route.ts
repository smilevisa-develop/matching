/**
 * 内定後タスク管理表 (スプレッドシート) を作る (要ログイン)。
 *
 * POST /api/admin/onboarding-task-sheet
 *   body: { folderUrl?: string, title?: string }
 *
 * lib/onboarding-task-master.ts の内容を 1 行 1 タスクで書き出し、
 * 完了列にはチェックボックス、ステータス列にはプルダウンを付ける。
 * 作ったあとは普通のスプレッドシートなので、現場で自由に編集できる。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { MASTER_TASKS, TASK_PHASES } from "@/lib/onboarding-task-master";
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
  "期限目安（内定受領から）",
  "担当",
  "対象",
  "手順・ポイント",
  "必要なエビデンス",
  "この項目が入った理由（過去の問題）",
  "実施日",
  "記入者",
  "備考",
];

const STATUS_OPTIONS = ["未着手", "対応中", "完了", "該当なし"];

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

    // 並び順: 工程 → 期限
    const tasks = [...MASTER_TASKS].sort((a, b) => {
      const pa = TASK_PHASES.indexOf(a.phase);
      const pb = TASK_PHASES.indexOf(b.phase);
      return pa - pb || a.dueDays - b.dueDays;
    });

    const rows = tasks.map((t, i) => [
      String(i + 1),
      t.phase,
      t.title,
      "FALSE", // チェックボックス
      "未着手",
      `${t.dueDays}日後`,
      t.owner,
      t.target,
      t.howto,
      t.evidence,
      t.problem ?? "",
      "",
      "",
      "",
    ]);

    // CSV で作ってから Sheets に変換 (改行・カンマを含むので quote する)
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [HEADER, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const { Readable } = await import("node:stream");
    const created = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: title,
        parents: [parentId],
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
      media: { mimeType: "text/csv", body: Readable.from(Buffer.from(csv, "utf-8")) },
      fields: "id,webViewLink,name",
    });
    const spreadsheetId = created.data.id!;

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title))",
    });
    const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
    const lastRow = rows.length + 1;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // ヘッダー: 太字・背景・折り返し・固定
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
          // 本文: 折り返し + 上揃え
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: lastRow },
              cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
              fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
            },
          },
          // 完了列 = チェックボックス
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 3, endColumnIndex: 4 },
              rule: { condition: { type: "BOOLEAN" }, strict: true },
            },
          },
          // ステータス列 = プルダウン
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
          // 完了した行をグレーにする
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 0, endColumnIndex: HEADER.length }],
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
          // 「過去の問題」が入っている行は左端に色を付けて目立たせる
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 10, endColumnIndex: 11 }],
                booleanRule: {
                  condition: { type: "NOT_BLANK" },
                  format: { backgroundColor: { red: 1, green: 0.95, blue: 0.9 } },
                },
              },
              index: 1,
            },
          },
          // 列幅
          ...[
            [0, 45],
            [1, 150],
            [2, 300],
            [3, 55],
            [4, 90],
            [5, 110],
            [6, 130],
            [7, 150],
            [8, 320],
            [9, 180],
            [10, 260],
            [11, 90],
            [12, 90],
            [13, 160],
          ].map(([index, size]) => ({
            updateDimensionProperties: {
              range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
              properties: { pixelSize: size },
              fields: "pixelSize",
            },
          })),
        ],
      },
    });

    // 社内の誰でも開けるようにする (組織内リンク共有)
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        supportsAllDrives: true,
        requestBody: { role: "writer", type: "domain", domain: "croslan.co.jp" },
      });
    } catch {
      // ドメイン共有できない場合はフォルダの共有設定に従う
    }

    return Response.json({
      ok: true,
      title: created.data.name,
      url: created.data.webViewLink,
      taskCount: rows.length,
      fromProblems: tasks.filter((t) => t.problem).length,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
