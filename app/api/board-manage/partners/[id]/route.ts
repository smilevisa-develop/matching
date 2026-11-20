/**
 * 案件ボードの管理: パートナーを登録済みにする・許可番号を入れる・専用リンクを作る (要ログイン)。
 * PATCH { boardEnabled?, licenseNumber?, rotateLink? }
 * 登録済みにするには許可番号 (海外は取次機関の申告) が要る。
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { boardEnterUrl } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    const body = await req.json().catch(() => ({}));

    const current = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { boardEnabled: true, boardToken: true, licenseNumber: true },
    });
    if (!current) return Response.json({ ok: false, error: "パートナーが見つかりません" }, { status: 404 });

    const licenseNumber =
      typeof body?.licenseNumber === "string" ? body.licenseNumber.trim().slice(0, 100) : (current.licenseNumber ?? "");
    const boardEnabled = typeof body?.boardEnabled === "boolean" ? body.boardEnabled : current.boardEnabled;
    if (boardEnabled && !licenseNumber) {
      return Response.json({ ok: false, error: "登録済みにするには、許可番号（または取次機関の申告）を入れてください" }, { status: 400 });
    }

    // 登録済みにしたとき鍵がなければ作る。作り直しの指示があれば新しい鍵にする (古いリンクは使えなくなる)
    const needToken = boardEnabled && (!current.boardToken || body?.rotateLink === true);
    const boardToken = needToken ? randomBytes(24).toString("base64url") : current.boardToken;

    await prisma.partner.update({
      where: { id: partnerId },
      data: { licenseNumber: licenseNumber || null, boardEnabled, boardToken },
    });

    return Response.json({ ok: true, url: boardEnabled && boardToken ? boardEnterUrl(boardToken) : null });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
