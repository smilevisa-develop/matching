import { prisma } from "@/lib/prisma";
import { requireApiAccount, AuthError } from "@/lib/auth";
import { after } from "next/server";
import { nextCompanyExternalId, requestCompanyDatabaseSync } from "@/lib/company-db-sync";

export async function GET() {
  try {
    await requireApiAccount();
    const companies = await prisma.company.findMany({
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return Response.json({ ok: true, companies });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return Response.json({ ok: false, error: "企業名を入力してください" }, { status: 400 });
    }

    // 企業IDが空欄だとスプシの企業マスタに載せられず、案件も反映できない。
    // 空欄なら次の空き番号 (例: 70sv) を自動で付ける。
    const externalId =
      String(body.externalId ?? "").trim().toLowerCase() || (await nextCompanyExternalId());
    if (externalId) {
      const duplicate = await prisma.company.findUnique({ where: { externalId } });
      if (duplicate) {
        return Response.json({ ok: false, error: `企業ID "${externalId}" は既に使われています` }, { status: 409 });
      }
    }
    const company = await prisma.company.create({
      data: {
        externalId,
        name,
        industry: String(body.industry ?? "").trim() || null,
        location: String(body.location ?? "").trim() || null,
        hiringStatus: String(body.hiringStatus ?? "").trim() || "募集中",
        driveFolderUrl: String(body.driveFolderUrl ?? "").trim() || null,
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
