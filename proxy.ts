import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/api/auth") ||
    // 外部からの Webhook (LINE / Messenger / WhatsApp 等) は未ログインで呼ばれる
    pathname.startsWith("/api/line/webhook") ||
    pathname.startsWith("/api/messenger/webhook") ||
    pathname.startsWith("/api/whatsapp/webhook") ||
    // 候補者向け公開フォーム (intake) は token 認証で動作するため未ログイン可
    pathname.startsWith("/intake/") ||
    pathname.startsWith("/api/intake/") ||
    // 法的文書ページ (Meta App Review 要件) は完全公開
    pathname.startsWith("/legal/")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
