/**
 * TikTok の同意画面から戻ってくる先。code をトークンに換えてアカウントを保存し、SNS ページへ戻す (管理者のみ)。
 */

import { cookies } from "next/headers";
import { requireApiAdmin } from "@/lib/auth";
import { exchangeCodeAndSave } from "@/lib/sns-tiktok";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const back = (q: string) => Response.redirect(publicUrl(`/sns?tiktok=${q}`), 302);
  try {
    await requireApiAdmin();
  } catch {
    return Response.redirect(publicUrl("/login"), 302);
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("sns_tiktok_state")?.value;
  jar.delete("sns_tiktok_state");
  if (!code || !state || !expected || state !== expected) return back("error");
  try {
    await exchangeCodeAndSave(code);
    return back("ok");
  } catch (e) {
    console.warn("TikTok 接続に失敗:", e instanceof Error ? e.message : e);
    return back("error");
  }
}
