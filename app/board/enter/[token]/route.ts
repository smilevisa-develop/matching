/**
 * 案件ボードの入口。パートナーごとの専用リンク /board/enter/{token} を開くと、
 * 鍵を cookie に入れて /board に移る。リンクが無効なら /board で案内を出す。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOARD_COOKIE, BOARD_COOKIE_MAX_AGE } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  // 転送先は自分のサイトの /board だけ (外部への転送には使わせない)
  const target = new URL("/board", url);

  const partner =
    token && token.length >= 16
      ? await prisma.partner.findUnique({ where: { boardToken: token }, select: { id: true, boardEnabled: true } })
      : null;

  if (!partner || !partner.boardEnabled) {
    target.searchParams.set("invalid", "1");
    const res = NextResponse.redirect(target);
    res.cookies.set(BOARD_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(BOARD_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BOARD_COOKIE_MAX_AGE,
  });
  return res;
}
