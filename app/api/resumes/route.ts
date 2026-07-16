import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { buildResumePlaceholders } from "@/lib/resume-placeholders";
import {
  buildPersonAssetName,
  buildPersonFolderName,
  createResumeDocumentFromTemplate,
  ensurePersonDriveFolder,
  uploadDataUrlToDrive,
} from "@/lib/google-docs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json();
    const personId = Number(body.personId);
    const templateId = Number(body.templateId);
    const title = String(body.title ?? "").trim();
    const documentUrl = String(body.documentUrl ?? "").trim();

    if (!Number.isFinite(personId) || !Number.isFinite(templateId) || !title) {
      return Response.json(
        { ok: false, error: "候補者、テンプレート、履歴書名を入力してください" },
        { status: 400 }
      );
    }

    // テンプレートは全アカウントで共有
    const template = await prisma.resumeTemplate.findFirst({
      where: { id: templateId },
    });

    if (!template) {
      return Response.json({ ok: false, error: "テンプレートが見つかりません" }, { status: 404 });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        onboarding: true,
        resumeProfile: true,
      },
    });

    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    const folderName = buildPersonFolderName({
      id: person.id,
      englishName: person.onboarding?.englishName ?? null,
      name: person.name,
    });
    // 保存先は必ず候補者フォルダ (候補者ルート配下で id プレフィックスでフォルダ検索、なければ新規作成)
    const folder = await ensurePersonDriveFolder({
      existingFolderUrl: person.driveFolderUrl,
      personId: person.id,
      personName: folderName,
    });

    if (person.driveFolderUrl !== folder.folderUrl) {
      await prisma.person.update({
        where: { id: person.id },
        data: { driveFolderUrl: folder.folderUrl },
      });
    }

    // ファイル名は {ID}_{英語名/カナ}_{書類名} 形式で統一
    // title はユーザーが入力した "履歴書" などの書類名 (UI側でテンプレ名などを割当)
    const assetName = title
      .replace(new RegExp(`^\\d{4,}_`), "") // 旧形式の ID_ を取り除く
      .replace(new RegExp(`^${person.name}\\s*`), "") // 名前重複を除去
      .replace(new RegExp(`^${person.onboarding?.englishName ?? ""}\\s*`), "")
      .trim() || "履歴書";
    const prefixedTitle = buildPersonAssetName({
      person: {
        id: person.id,
        englishName: person.onboarding?.englishName ?? null,
        name: person.name,
      },
      assetName,
    });
    // 顔写真は http(s) の公開URL のみ Google Docs に挿入できる (data: URL は不可)
    // データ URL が残っている旧候補者は、この場で Drive に上げて https URL に変換 & DB も更新
    let photoUrl: string | null = null;
    if (person.photoUrl) {
      if (/^https?:\/\//.test(person.photoUrl)) {
        photoUrl = person.photoUrl;
      } else if (person.photoUrl.startsWith("data:")) {
        try {
          const uploaded = await uploadDataUrlToDrive({
            dataUrl: person.photoUrl,
            fileName: buildPersonAssetName({
              person: {
                id: person.id,
                englishName: person.onboarding?.englishName ?? null,
                name: person.name,
              },
              assetName: "顔写真",
            }),
            folderUrl: folder.folderUrl,
          });
          if (uploaded?.fileUrl) {
            photoUrl = uploaded.fileUrl;
            await prisma.person.update({
              where: { id: person.id },
              data: { photoUrl: uploaded.fileUrl },
            });
          }
        } catch (err) {
          console.warn(
            `[resumes] data URL → Drive アップロード失敗 personId=${person.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    const generated = await createResumeDocumentFromTemplate({
      templateUrl: template.templateUrl,
      folderUrl: folder.folderUrl,
      title: prefixedTitle,
      replacements: buildResumePlaceholders({ person }),
      photoUrl,
    });

    const resume = await prisma.resumeDocument.create({
      data: {
        personId,
        templateId: template.id,
        accountId: account.id,
        title: prefixedTitle,
        documentId: generated.documentId,
        documentUrl: generated.documentUrl || documentUrl || null,
        driveFolderUrl: folder.folderUrl,
        status: "generated",
      },
      include: {
        person: { select: { name: true } },
        template: { select: { name: true } },
      },
    });

    return Response.json({
      ok: true,
      resume: {
        id: resume.id,
        title: resume.title,
        status: resume.status,
        documentUrl: resume.documentUrl,
        driveFolderUrl: resume.driveFolderUrl,
        personName: resume.person.name,
        templateName: resume.template.name,
        createdAt: resume.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
