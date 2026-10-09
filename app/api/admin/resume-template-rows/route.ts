/**
 * 履歴書テンプレートに職歴の行を増やす (要ログイン)。
 *
 * GET  /api/admin/resume-template-rows   いまテンプレに何組あるか確認するだけ
 * POST /api/admin/resume-template-rows   足りない組を追加する (既にある組は触らない)
 *
 * システム側は職歴を 8 社まで出力できるが、テンプレ (Google ドキュメント) に
 * {{入社N}}{{会社名N}}{{退社N}}{{退社Nラベル}} の行が無いと紙に出ない。
 * その行をテンプレ本体に足す。空いた組は出力時に自動で削除されるので、
 * 職歴が少ない候補者の履歴書に空行は残らない。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensureResumeWorkRows, RESUME_MAX_WORKS, parseGoogleDocId } from "@/lib/google-docs";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** テンプレに入っている職歴の組数を数える */
async function countWorkGroups(templateUrl: string): Promise<number> {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/documents.readonly"],
  });
  await auth.authorize();
  const docs = google.docs({ version: "v1", auth });
  const doc = await docs.documents.get({ documentId: parseGoogleDocId(templateUrl) });
  const text = JSON.stringify(doc.data);
  let n = 0;
  while (text.includes(`{{会社名${n + 1}}}`)) n++;
  return n;
}

async function loadTemplate(id?: number | null) {
  return id
    ? prisma.resumeTemplate.findUnique({ where: { id } })
    : prisma.resumeTemplate.findFirst({ orderBy: { id: "asc" } });
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const id = Number(new URL(req.url).searchParams.get("templateId"));
    const template = await loadTemplate(Number.isFinite(id) && id > 0 ? id : null);
    if (!template) {
      return Response.json({ ok: false, error: "履歴書テンプレートが登録されていません" }, { status: 404 });
    }
    const groups = await countWorkGroups(template.templateUrl);
    return Response.json({
      ok: true,
      template: { id: template.id, name: template.name, url: template.templateUrl },
      workGroupsInTemplate: groups,
      systemMax: RESUME_MAX_WORKS,
      missing: Math.max(0, RESUME_MAX_WORKS - groups),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const id = Number(new URL(req.url).searchParams.get("templateId"));
    const template = await loadTemplate(Number.isFinite(id) && id > 0 ? id : null);
    if (!template) {
      return Response.json({ ok: false, error: "履歴書テンプレートが登録されていません" }, { status: 404 });
    }
    const result = await ensureResumeWorkRows({ templateUrl: template.templateUrl });
    return Response.json({ ok: true, template: template.name, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
