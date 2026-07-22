/**
 * スプシ DB に行が無い候補者を、そのまま貼り付けられる TSV で返す。
 * スプシへの書き込みは一切しない (読み取りのみ)。
 *
 * GET /api/admin/sheet-missing-rows           ← TSV (text/plain)。ブラウザで開いて全選択→コピー
 * GET /api/admin/sheet-missing-rows?header=1  ← 1 行目に見出しを付ける
 * GET /api/admin/sheet-missing-rows?format=json ← 件数と一覧を JSON で確認
 * GET /api/admin/sheet-missing-rows?format=ids  ← ID 列の実データ (行番号 / 値 / 型 / 重複) を診断
 *
 * 貼り付け手順:
 *   1. この URL をブラウザで開く
 *   2. 全選択 (⌘A) → コピー (⌘C)
 *   3. スプシ DB シートの 最終行の次の A 列 を選択して貼り付け (⌘V)
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  findMissingCandidateRows,
  inspectSheetIdColumn,
  parseSheetIdFromUrl,
  SYNC_HEADERS,
  SYNC_SHEET_TAB_NAME,
  type PersonForSync,
} from "@/lib/sheets-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** タブ・改行はセルを壊すので空白に潰す */
function tsvCell(v: string | number): string {
  return String(v ?? "").replace(/[\t\r\n]+/g, " ");
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const { searchParams } = new URL(req.url);
    const withHeader = searchParams.get("header") === "1";
    const format = searchParams.get("format");
    const asJson = format === "json";
    const asIds = format === "ids";
    const sheetName = searchParams.get("sheet") ?? SYNC_SHEET_TAB_NAME;

    const sheetUrl = process.env.SYNC_SHEET_URL?.trim();
    if (!sheetUrl) {
      return Response.json({ ok: false, error: "SYNC_SHEET_URL が未設定です" }, { status: 500 });
    }
    const spreadsheetId = parseSheetIdFromUrl(sheetUrl);
    if (!spreadsheetId) {
      return Response.json(
        { ok: false, error: `SYNC_SHEET_URL から Sheet ID を解析できません: ${sheetUrl}` },
        { status: 500 },
      );
    }

    // ID 列の実データ診断 (DB を読まずに済むので先に返す)
    if (asIds) {
      const info = await inspectSheetIdColumn({ spreadsheetId, sheetName });
      return Response.json({ ok: true, sheetName, ...info });
    }

    const rawPersons = await prisma.person.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        nationality: true,
        residenceStatus: true,
        driveFolderUrl: true,
        createdAt: true,
        partner: { select: { name: true } },
        onboarding: {
          select: { englishName: true, birthDate: true, postalCode: true, address: true },
        },
        resumeProfile: {
          select: {
            gender: true,
            visaExpiryDate: true,
            japaneseLevel: true,
            traineeExperience: true,
            preferenceNote: true,
            remarks: true,
            resumeFileUrl: true,
          },
        },
        dealCandidates: {
          select: {
            stage: true,
            updatedAt: true,
            deal: { select: { company: { select: { name: true } } } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    const candidates: PersonForSync[] = rawPersons;

    const { missing, existingIdCount } = await findMissingCandidateRows({
      spreadsheetId,
      sheetName,
      candidates,
    });

    if (asJson) {
      return Response.json({
        ok: true,
        sheetName,
        systemCount: candidates.length,
        existingIdCount,
        missingCount: missing.length,
        missing: missing.map((m) => ({ id: m.id, name: m.name })),
      });
    }

    const lines: string[] = [];
    if (withHeader) lines.push(SYNC_HEADERS.map((h) => tsvCell(h.replace(/\n/g, ""))).join("\t"));
    for (const m of missing) lines.push(m.row.map(tsvCell).join("\t"));

    const body =
      missing.length === 0
        ? "スプシに未登録の候補者はありません。"
        : lines.join("\n");

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
