/**
 * 画像配信エンドポイント
 *
 * LINE / Messenger / WhatsApp の originalContentUrl 用に
 * 認証なしで配信する。id (cuid) を知っている人だけアクセス可能。
 *
 * - Content-Type は保存時の mimeType
 * - 長めの Cache-Control (LINE CDN がキャッシュする想定)
 * - expiresAt 経過後は 410 Gone を返す
 */

import { prisma } from "@/lib/prisma";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const file = await prisma.uploadedFile.findUnique({
    where: { id },
    select: { mimeType: true, data: true, expiresAt: true, filename: true },
  });

  if (!file) {
    return new Response("Not Found", { status: 404 });
  }

  if (file.expiresAt && file.expiresAt.getTime() < Date.now()) {
    return new Response("Gone", { status: 410 });
  }

  // LINE はオリジナルファイルを 1 度ダウンロードして CDN にキャッシュするので、
  // 1 時間程度キャッシュさせれば十分。public + immutable で OK (id は不変)。
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "public, max-age=3600, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}
