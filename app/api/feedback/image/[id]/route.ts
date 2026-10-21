/**
 * 修正依頼のスクリーンショットを返す (要ログイン)。
 * 画面には候補者の情報が写るので、LINE 配信用の /api/files (公開) とは分けている。
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const file = await prisma.uploadedFile.findUnique({ where: { id }, select: { mimeType: true, data: true } });
    if (!file) return new Response("Not Found", { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: { "Content-Type": file.mimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "error", { status: error instanceof AuthError ? error.status : 500 });
  }
}
