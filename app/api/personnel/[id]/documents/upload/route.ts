import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { ensurePersonDriveFolder } from "@/lib/google-docs";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { getDocumentDefinitions } from "@/lib/candidate-profile";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "").trim();
    if (!(file instanceof File) || !kind) {
      return Response.json({ ok: false, error: "file と kind が必要です" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ ok: false, error: "ファイルは 20MB 以下にしてください" }, { status: 413 });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, residenceStatus: true, driveFolderUrl: true, onboarding: { select: { englishName: true } } },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    // 候補者 Drive フォルダを確保 (無ければ ID プレフィックスで検索 → 新規作成)
    const folder = await ensurePersonDriveFolder({
      existingFolderUrl: person.driveFolderUrl,
      personName: person.onboarding?.englishName?.trim() || person.name,
      personId: person.id,
    });
    if (!folder.folderId) {
      return Response.json({ ok: false, error: "Drive フォルダ ID を解決できません" }, { status: 500 });
    }

    // フォルダ URL が DB 未保存なら更新
    if (!person.driveFolderUrl && folder.folderUrl) {
      await prisma.person.update({ where: { id: person.id }, data: { driveFolderUrl: folder.folderUrl } });
    }

    // 書類サブフォルダ "書類" を確保
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    await auth.authorize();
    const drive = google.drive({ version: "v3", auth });

    const subFolderName = "書類";
    let docFolderId: string | null = null;
    {
      const list = await drive.files.list({
        q: `name = '${subFolderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${folder.folderId}' in parents and trashed = false`,
        fields: "files(id,name)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const found = list.data.files?.[0];
      if (found?.id) {
        docFolderId = found.id;
      } else {
        const created = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: subFolderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [folder.folderId],
          },
          fields: "id",
        });
        docFolderId = created.data.id ?? null;
      }
    }
    if (!docFolderId) {
      return Response.json({ ok: false, error: "Drive 書類フォルダの確保に失敗しました" }, { status: 500 });
    }

    // ファイル名: "{kind ラベル}_{元ファイル名}"。同名があれば既存を上書き (差し替え) せずタイムスタンプ付与
    const docDef = getDocumentDefinitions(person.residenceStatus).find((d) => d.kind === kind);
    const labelSafe = (docDef?.label ?? kind).replace(/[\\/:*?"<>|]/g, "_");
    const origName = file.name.replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `${labelSafe}_${origName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const created = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [docFolderId],
      },
      media: { mimeType, body: Readable.from(buffer) },
      fields: "id,webViewLink,webContentLink,thumbnailLink,name,mimeType",
    });
    if (!created.data.id) {
      return Response.json({ ok: false, error: "Drive アップロードに失敗しました" }, { status: 500 });
    }

    const fileUrl =
      created.data.webViewLink ?? `https://drive.google.com/file/d/${created.data.id}/view`;

    // PortalDocument に upsert (kind 単位で 1 件)
    await prisma.portalDocument.upsert({
      where: { personId_kind: { personId, kind } },
      create: {
        personId,
        kind,
        fileName: created.data.name ?? fileName,
        fileUrl,
        mimeType: created.data.mimeType ?? mimeType,
        autoJudgeStatus: "accepted",
        autoJudgeNote: "Drive アップロード",
      },
      update: {
        fileName: created.data.name ?? fileName,
        fileUrl,
        mimeType: created.data.mimeType ?? mimeType,
        autoJudgeStatus: "accepted",
        autoJudgeNote: "Drive アップロード",
      },
    });

    return Response.json({
      ok: true,
      kind,
      fileId: created.data.id,
      fileName: created.data.name ?? fileName,
      fileUrl,
      mimeType: created.data.mimeType ?? mimeType,
      driveFolderUrl: folder.folderUrl,
    });
  } catch (error) {
    console.error("documents/upload error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

