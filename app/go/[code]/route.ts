/**
 * SNS のプロフィールに貼る相談リンク。GET /go/[国]-[媒体] (例: /go/id-tiktok)
 * 押された数を記録して、その国の相談先 (設定ページで決めた URL) へ飛ばす。未ログインで開ける (lib/sns-funnel.ts)
 */
import { prisma } from "@/lib/prisma";
import { getLinkTargets, isCountry, isPlatform } from "@/lib/sns-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = /bot|crawler|spider|facebookexternalhit|preview|slurp|curl|wget/i;

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const [country, platform] = code.toLowerCase().split("-");
  if (!isCountry(country) || !isPlatform(platform)) return new Response("Not found", { status: 404 });
  const target = (await getLinkTargets())[country];
  if (!target) return new Response("Not found", { status: 404 });
  // リンクのプレビュー (SNS や LINE が中身を見に来る) は数えない
  if (!BOT.test(req.headers.get("user-agent") ?? "")) {
    await prisma.snsLinkClick.create({ data: { country, platform } }).catch((e) => console.warn("相談リンクの記録に失敗:", e));
  }
  return Response.redirect(target, 302);
}
