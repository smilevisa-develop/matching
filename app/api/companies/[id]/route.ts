import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { after } from "next/server";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { COMPANY_EXTERNAL_ID_RE } from "@/lib/deal-stages";
import { deleteCompanyEverywhere } from "@/lib/company-delete";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id: Number(id) },
      include: {
        deals: {
          include: {
            owner: { select: { name: true } },
            candidates: { select: { id: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        },
      },
    });

    if (!company) {
      return Response.json({ ok: false, error: "企業が見つかりません" }, { status: 404 });
    }

    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

/** 企業ID と 支援の形 (自社支援 / 委託管理) だけを直す (PUT は全項目を上書きするので分けている) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const supportType =
      body.supportType === "自社支援" || body.supportType === "委託管理" ? (body.supportType as string) : undefined;
    const companyKind =
      body.companyKind === "通常" || body.companyKind === "人材紹介会社" ? (body.companyKind as string) : undefined;
    if (body.externalId === undefined && (supportType || companyKind)) {
      const company = await prisma.company.update({
        where: { id: Number(id) },
        data: { ...(supportType ? { supportType } : {}), ...(companyKind ? { companyKind } : {}) },
      });
      return Response.json({ ok: true, company });
    }
    const externalId = String(body.externalId ?? "").trim().toLowerCase();
    if (!COMPANY_EXTERNAL_ID_RE.test(externalId)) {
      return Response.json(
        { ok: false, error: "企業IDは半角英数字で入力してください (例: 73sv)" },
        { status: 400 },
      );
    }
    const dup = await prisma.company.findFirst({ where: { externalId, NOT: { id: Number(id) } } });
    if (dup) {
      return Response.json(
        { ok: false, error: `企業ID "${externalId}" は「${dup.name}」で使われています` },
        { status: 409 },
      );
    }
    const company = await prisma.company.update({
      where: { id: Number(id) },
      data: { externalId, ...(supportType ? { supportType } : {}), ...(companyKind ? { companyKind } : {}) },
    });
    after(() => requestCompanyDatabaseSync());
    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return Response.json({ ok: false, error: "企業名を入力してください" }, { status: 400 });
    }

    const externalId = body.externalId !== undefined
      ? (String(body.externalId ?? "").trim() || null)
      : undefined;
    if (externalId) {
      const dup = await prisma.company.findFirst({
        where: { externalId, NOT: { id: Number(id) } },
      });
      if (dup) {
        return Response.json({ ok: false, error: `企業ID "${externalId}" は既に使われています` }, { status: 409 });
      }
    }
    const company = await prisma.company.update({
      where: { id: Number(id) },
      data: {
        name,
        ...(externalId !== undefined ? { externalId } : {}),
        industry: String(body.industry ?? "").trim() || null,
        location: String(body.location ?? "").trim() || null,
        hiringStatus: String(body.hiringStatus ?? "").trim() || "募集中",
        // 支援の形 (自社支援 / 委託管理)。委託管理の内定者は内定者管理ボードに出さない
        ...(body.supportType === "自社支援" || body.supportType === "委託管理" ? { supportType: body.supportType } : {}),
        driveFolderUrl: body.driveFolderUrl !== undefined
          ? (String(body.driveFolderUrl ?? "").trim() || null)
          : undefined,
        notes: String(body.notes ?? "").trim() || null,
      },
    });

    // 企業データベース(スプシ)へ保存直後に反映する (応答は待たせない)
    after(() => requestCompanyDatabaseSync());
    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    // システム・スプシ (企業マスタ / 案件管理 / 条件マスタ)・空の Drive フォルダをまとめて消す。
    // 片方だけ消すと、次の同期でもう片方から作り直されるため
    const result = await deleteCompanyEverywhere(Number(id));
    return Response.json({ ok: true, sheetRows: result.sheetRows.length, folderTrashed: result.folderTrashed });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
