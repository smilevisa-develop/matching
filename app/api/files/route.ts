/**
 * 画像アップロード API (一斉送信の添付画像用)
 *
 * 制約:
 *   - 画像のみ (JPG / PNG)
 *   - 1 ファイル最大 5MB
 *   - 公開アクセス可能な URL を返す (LINE / Messenger の originalContentUrl 用)
 *   - id は cuid なので URL 推測不可、実質的な保護にはなる
 *   - 90 日後 expiresAt で自動削除 (別途 cron で物理削除)
 *
 * 認証:
 *   POST   は管理者ログイン必須
 *   GET (個別配信) は無認証 (CDN にキャッシュさせるため)
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const EXPIRES_DAYS = 90;

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { ok: false, error: "file フィールドが必要です (multipart/form-data)" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json(
        { ok: false, error: `画像のみアップロードできます (JPG / PNG)。受信: ${file.type}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return Response.json(
        {
          ok: false,
          error: `ファイルサイズが上限 (5MB) を超えています: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRES_DAYS);

    const saved = await prisma.uploadedFile.create({
      data: {
        filename: file.name || "upload",
        mimeType: file.type,
        sizeBytes: file.size,
        data: buf,
        uploaderAccountId: account.id,
        expiresAt,
      },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    return Response.json({
      ok: true,
      file: {
        id: saved.id,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        url: `/api/files/${saved.id}`,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
