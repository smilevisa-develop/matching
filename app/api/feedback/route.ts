/**
 * 修正依頼 (要ログイン)。
 *
 * POST /api/feedback   multipart: body (文章), pageUrl, images (画像ファイル、最大 5 枚 / 各 8MB)
 *   → 保存。日本語以外なら送信後に日本語訳を付ける。FEEDBACK_SLACK_WEBHOOK_URL があれば Slack にも通知
 * GET  /api/feedback?mine=1   自分が送った依頼 (状態と返事)
 * GET  /api/feedback          全件 (管理者)。?status=未対応 で絞り込み
 * GET  /api/feedback?count=1  未対応の件数 (サイドバーのバッジ用)
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { translateToJapanese } from "@/lib/translate-ja";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const form = await req.formData();
    const body = String(form.get("body") ?? "").trim();
    const pageUrl = String(form.get("pageUrl") ?? "").trim().slice(0, 500) || "/";
    const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (!body && files.length === 0) {
      return Response.json({ ok: false, error: "内容かスクリーンショットを入れてください" }, { status: 400 });
    }

    const imageIds: string[] = [];
    for (const f of files.slice(0, MAX_IMAGES)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_BYTES) {
        return Response.json({ ok: false, error: `画像が大きすぎます (8MB まで): ${f.name}` }, { status: 400 });
      }
      const saved = await prisma.uploadedFile.create({
        data: {
          filename: f.name || "screenshot.png",
          mimeType: f.type,
          sizeBytes: f.size,
          data: Buffer.from(await f.arrayBuffer()),
          uploaderAccountId: account.id,
          expiresAt: null,
        },
        select: { id: true },
      });
      imageIds.push(saved.id);
    }

    const report = await prisma.feedbackReport.create({
      data: { accountId: account.id, accountName: account.name, pageUrl, body: body || "(スクリーンショットのみ)", imageIds },
    });

    after(async () => {
      const ja = await translateToJapanese(body);
      if (ja) await prisma.feedbackReport.update({ where: { id: report.id }, data: { bodyJa: ja } });
      const hook = process.env.FEEDBACK_SLACK_WEBHOOK_URL?.trim();
      if (hook) {
        const text =
          `🛠 修正依頼 #${report.id}（${account.name}）\n画面: ${publicUrl(pageUrl)}\n${body}` +
          (ja ? `\n（訳）${ja}` : "") +
          (imageIds.length ? `\nスクショ ${imageIds.length} 枚` : "") +
          `\n一覧: ${publicUrl("/feedback")}`;
        await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(
          () => undefined,
        );
      }
    });

    return Response.json({ ok: true, id: report.id });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const account = await requireApiAccount();
    const url = new URL(req.url);
    if (url.searchParams.get("count")) {
      const open = await prisma.feedbackReport.count({ where: { status: "未対応" } });
      return Response.json({ ok: true, open });
    }
    const mine = url.searchParams.get("mine") === "1";
    const status = url.searchParams.get("status");
    const reports = await prisma.feedbackReport.findMany({
      where: { ...(mine ? { accountId: account.id } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: mine ? 20 : 200,
    });
    return Response.json({ ok: true, reports });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
