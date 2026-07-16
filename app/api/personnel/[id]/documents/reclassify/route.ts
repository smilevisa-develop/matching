/**
 * アップロード済みの Drive ファイルに書類種別を付け直す。
 * - Drive 側でファイル名を新しい label に変更
 * - PortalDocument の kind を newKind に更新 (oldKind 行があれば削除)
 *
 * body: {
 *   fileId: string;      // Drive の fileId
 *   oldKind?: string;    // 元の PortalDocument kind (null なら新規)
 *   newKind: string;
 * }
 */

import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { buildPersonAssetName } from "@/lib/google-docs";
import { getDocumentKindLabel } from "@/lib/file-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Readable の未使用警告回避 (google-docs から import しているだけで未使用ではないが lint 対策)
void Readable;

async function driveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) throw new Error("Google SA 未設定");
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const personId = Number(id);
    if (!Number.isFinite(personId) || personId <= 0) {
      return Response.json({ ok: false, error: "candidate id が不正です" }, { status: 400 });
    }
    const body = await req.json();
    const fileId = String(body?.fileId ?? "").trim();
    const oldKind = typeof body?.oldKind === "string" ? body.oldKind.trim() : "";
    const newKind = String(body?.newKind ?? "").trim();
    if (!fileId || !newKind) {
      return Response.json({ ok: false, error: "fileId / newKind が必要です" }, { status: 400 });
    }
    if (oldKind && oldKind === newKind) {
      return Response.json({ ok: true, unchanged: true });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        name: true,
        onboarding: { select: { englishName: true } },
      },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    const drive = await driveClient();
    // 現在の Drive ファイル名から拡張子を取り出し、新しい label で置き換え
    const meta = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,webViewLink",
      supportsAllDrives: true,
    });
    const currentName = meta.data.name ?? "";
    const ext = currentName.match(/\.[^.]+$/)?.[0] ?? "";
    const newLabel = getDocumentKindLabel(newKind);
    const newName =
      buildPersonAssetName({
        person: {
          id: person.id,
          name: person.name,
          englishName: person.onboarding?.englishName ?? null,
        },
        assetName: newLabel,
      }) + ext;

    if (newName !== currentName) {
      await drive.files.update({
        fileId,
        requestBody: { name: newName },
        supportsAllDrives: true,
      });
    }

    // PortalDocument 更新
    // 旧 kind の行があれば削除、新 kind に upsert
    if (oldKind && oldKind !== newKind) {
      try {
        await prisma.portalDocument.delete({
          where: { personId_kind: { personId, kind: oldKind } },
        });
      } catch {
        // 旧行がなくても続行
      }
    }
    const fileUrl = meta.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
    await prisma.portalDocument.upsert({
      where: { personId_kind: { personId, kind: newKind } },
      create: {
        personId,
        kind: newKind,
        fileName: newName,
        fileUrl,
        mimeType: meta.data.mimeType ?? "application/octet-stream",
        autoJudgeStatus: "accepted",
        autoJudgeNote: "手動で書類種別を確定",
      },
      update: {
        fileName: newName,
        fileUrl,
        mimeType: meta.data.mimeType ?? "application/octet-stream",
        autoJudgeStatus: "accepted",
        autoJudgeNote: "手動で書類種別を確定",
      },
    });

    return Response.json({
      ok: true,
      fileId,
      fileName: newName,
      fileUrl,
      newKind,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
