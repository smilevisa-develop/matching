/**
 * Meta (Facebook ページ / Instagram) との接続。SNS ページの「Meta と接続」から使う。
 *
 * アプリ ID とアプリシークレットは CoreSettings に保存 (Meta アプリ「株式会社CROSLAN」のもの。環境変数には入れない)。
 * 「Meta と接続」→ Facebook の同意画面 → /api/sns/meta/callback で code を長期のユーザートークン (約 60 日) に換えて保存する。
 * 切れたらもう一度「Meta と接続」を押すだけ。
 */

import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/public-url";

const API = "https://graph.facebook.com/v21.0";

/** 同意画面で求める権限 (アプリのユースケースに入れてあるものだけ)。pages_read_user_content = いいね・コメント数、instagram_manage_insights = IG の再生数 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];

export const META_CALLBACK_PATH = "/api/sns/meta/callback";

export type MetaConnection = {
  appId: string | null;
  hasSecret: boolean;
  connected: boolean;
  expiresAt: Date | null;
};

export async function getMetaConnection(): Promise<MetaConnection> {
  const s = await prisma.coreSettings.findUnique({
    where: { id: 1 },
    select: { snsMetaAppId: true, snsMetaAppSecret: true, snsMetaToken: true, snsMetaTokenExpiresAt: true },
  });
  return {
    appId: s?.snsMetaAppId ?? null,
    hasSecret: Boolean(s?.snsMetaAppSecret),
    connected: Boolean(s?.snsMetaToken),
    expiresAt: s?.snsMetaTokenExpiresAt ?? null,
  };
}

/** 保存してあるユーザートークン (無ければ環境変数 SNS_META_TOKEN) */
export async function getMetaToken(): Promise<string | null> {
  const s = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { snsMetaToken: true } });
  return s?.snsMetaToken ?? process.env.SNS_META_TOKEN?.trim() ?? null;
}

/** 同意画面の URL (state は CSRF 対策。callback で照合する) */
export function buildMetaAuthUrl(appId: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: publicUrl(META_CALLBACK_PATH),
    response_type: "code",
    scope: META_SCOPES.join(","),
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

/** code → 短期トークン → 長期トークン (約 60 日)。保存して返す */
export async function exchangeCodeAndSave(code: string): Promise<{ expiresAt: Date | null }> {
  const s = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { snsMetaAppId: true, snsMetaAppSecret: true } });
  if (!s?.snsMetaAppId || !s.snsMetaAppSecret) throw new Error("Meta のアプリ ID とシークレットが未設定です");
  const short = await fetch(
    `${API}/oauth/access_token?${new URLSearchParams({
      client_id: s.snsMetaAppId,
      client_secret: s.snsMetaAppSecret,
      redirect_uri: publicUrl(META_CALLBACK_PATH),
      code,
    })}`,
    { cache: "no-store" },
  );
  const shortJson = (await short.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!shortJson.access_token) throw new Error(`トークンの取得に失敗: ${shortJson.error?.message ?? short.status}`);
  const long = await fetch(
    `${API}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: s.snsMetaAppId,
      client_secret: s.snsMetaAppSecret,
      fb_exchange_token: shortJson.access_token,
    })}`,
    { cache: "no-store" },
  );
  const longJson = (await long.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  const token = longJson.access_token ?? shortJson.access_token;
  const expiresAt = longJson.expires_in ? new Date(Date.now() + longJson.expires_in * 1000) : null;
  await prisma.coreSettings.upsert({
    where: { id: 1 },
    create: { id: 1, snsMetaToken: token, snsMetaTokenExpiresAt: expiresAt },
    update: { snsMetaToken: token, snsMetaTokenExpiresAt: expiresAt },
  });
  return { expiresAt };
}
