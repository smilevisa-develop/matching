import { prisma } from "@/lib/prisma";
import { normalizeSupportMethod, writeSupportMethodToMaster } from "@/lib/company-support-method";
import { requireApiAccount, AuthError } from "@/lib/auth";
import { after } from "next/server";
import { nextCompanyExternalId, requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { ensureCompanyDriveFolder } from "@/lib/google-docs";

/** 次に使える企業ID (?nextId=人材紹介会社 / 通常) を返す */
async function nextIdResponse(kind: string) {
  return Response.json({ ok: true, externalId: await nextCompanyExternalId(kind) });
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
    const nextId = new URL(req.url).searchParams.get("nextId");
    if (nextId) return nextIdResponse(nextId);
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
    const companyKind = body.companyKind === "人材紹介会社" ? "人材紹介会社" : "通常";
    const externalId =
      String(body.externalId ?? "").trim().toLowerCase() || (await nextCompanyExternalId(companyKind));
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
        // 人材紹介会社は業種を持たない
        industry: companyKind === "人材紹介会社" ? null : String(body.industry ?? "").trim() || null,
        location: String(body.location ?? "").trim() || null,
        hiringStatus: String(body.hiringStatus ?? "").trim() || "募集中",
        companyKind,
        supportMethod: normalizeSupportMethod(body.supportMethod),
        // 人材紹介会社の内定者は内定者管理ボードに出さない (支援もしない)
        ...(companyKind === "人材紹介会社" ? { supportType: "委託管理" } : {}),
        driveFolderUrl: String(body.driveFolderUrl ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
      },
    });

    // 企業を追加した時点で Drive に企業フォルダ (企業ID_企業名) を作る。
    // 以前は求人票や推薦リストを作るときに初めて作っていた。同じ企業IDのフォルダが既にあればそれを使う
    let driveWarning: string | null = null;
    let saved = company;
    if (!company.driveFolderUrl) {
      try {
        const folder = await ensureCompanyDriveFolder({ externalId: company.externalId, companyName: company.name });
        if (folder.folderUrl) {
          saved = await prisma.company.update({ where: { id: company.id }, data: { driveFolderUrl: folder.folderUrl } });
        }
      } catch (error) {
        driveWarning = `Drive フォルダを作れませんでした: ${error instanceof Error ? error.message : String(error)}`;
        console.error("[companies] drive folder", error);
      }
    }

    // 企業データベース(スプシ)へ保存直後に反映する (応答は待たせない)。
    // 支援方法は企業マスタに行が追加されたあとに書く
    after(async () => {
      await requestCompanyDatabaseSync();
      if (company.supportMethod) await writeSupportMethodToMaster(company.externalId, company.supportMethod);
    });
    return Response.json({ ok: true, company: saved, driveWarning });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
