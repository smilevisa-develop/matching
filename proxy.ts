import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const PUBLIC_PATHS = ["/login"];

/** 外部からの Webhook (LINE / Messenger / WhatsApp)。メンテナンス中も受け取る */
const isWebhook = (pathname: string) =>
  pathname.startsWith("/api/line/webhook") ||
  pathname.startsWith("/api/slack/") ||
  pathname.startsWith("/api/messenger/webhook") ||
  pathname.startsWith("/api/whatsapp/webhook");

/**
 * サーバー移行用 (環境変数を入れた環境だけで動く)。
 *   MAINTENANCE_MODE=1  … 移行中の書き込みを止める。Webhook とヘルスチェック以外は 503
 *   FORWARD_TO_URL=...  … 旧サーバーから新サーバーへ。画面は転送し、/api は外部から呼ばれるので中継する
 */
function migrationResponse(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/api/health") return null;

  const forwardTo = process.env.FORWARD_TO_URL?.trim().replace(/\/+$/, "");
  if (forwardTo) {
    const target = new URL(`${pathname}${search}`, forwardTo);
    return pathname.startsWith("/api/") ? NextResponse.rewrite(target) : NextResponse.redirect(target, 308);
  }

  if (process.env.MAINTENANCE_MODE === "1" && !isWebhook(pathname)) {
    return new NextResponse(
      '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>メンテナンス中</title><body style="font-family:sans-serif;text-align:center;padding:64px 16px"><h1 style="font-size:20px">メンテナンス中です</h1><p>しばらくしてからもう一度開いてください。<br>System maintenance. Please try again later.</p></body></html>',
      { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "900" } },
    );
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const migration = migrationResponse(request);
  if (migration) return migration;

  if (
    pathname.startsWith("/_next") ||
    // Railway のデプロイ時 healthcheck (認証不要で 200 を返す)
    pathname === "/api/health" ||
    pathname.startsWith("/favicon") ||
    // TikTok for Developers の URL 所有確認ファイル (public/tiktok*.txt)
    /^\/tiktok[A-Za-z0-9]+\.txt$/.test(pathname) ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/api/auth") ||
    // 外部からの Webhook (LINE / Messenger / WhatsApp 等) は未ログインで呼ばれる
    isWebhook(pathname) ||
    // 定期実行 (GitHub Actions 等の外部 cron から呼ばれる) はログインセッションを持てない。
    // ハンドラ側で CRON_SECRET (Authorization: Bearer) により保護する。
    pathname.startsWith("/api/cron/") ||
    // 候補者向け公開フォーム (intake) は token 認証で動作するため未ログイン可
    pathname.startsWith("/intake/") ||
    pathname.startsWith("/api/intake/") ||
    // 新規パートナー向け自己記入フォーム (全員共通リンクの token で動作。未ログイン可)
    pathname.startsWith("/partner-intake/") ||
    pathname.startsWith("/api/partner-intake/") ||
    // パートナーアンケート (パートナーごとのリンクで開く)
    pathname.startsWith("/partner-survey/") ||
    pathname.startsWith("/api/partner-survey/") ||
    // 日本語チェック (公開・専用 token 認証。入力フォームとは別リンク)
    pathname.startsWith("/japanese-check/") ||
    pathname.startsWith("/api/japanese-check/") ||
    // AI 面接練習 (公開・候補者が自分で登録する)。
    // 担当者用の記録ページ /interview-practice/log はログインが必要なので、完全一致だけ通す
    pathname === "/interview-practice" ||
    pathname.startsWith("/api/interview-practice/") ||
    // 母国語 求人票チェックリスト (公開・token 認証)
    pathname.startsWith("/checklist/") ||
    pathname.startsWith("/api/checklist/") ||
    // 内定後の事前確認資料 (公開・token 認証)
    pathname.startsWith("/document-check/") ||
    pathname.startsWith("/api/document-check/") ||
    // 法的文書ページ (Meta App Review 要件) は完全公開
    pathname.startsWith("/legal/") ||
    // アップロード画像の配信 (LINE / Messenger / メール添付の originalContentUrl)。
    // GET /api/files/{cuid} のみ未ログイン可、POST /api/files (アップロード) は
    // ハンドラ側で requireApiAccount により保護される (pathname に trailing slash 無し)。
    pathname.startsWith("/api/files/") ||
    // SNS のプロフィールの相談リンク (押した数を数えて相談先へ飛ばす) と、相談を始めた人の記録 (Apps Script から呼ばれる)
    pathname.startsWith("/go/") ||
    pathname === "/api/sns/inquiry" ||
    // 企業向けの推薦リスト (見るだけ・token 認証)
    pathname.startsWith("/list/")
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
