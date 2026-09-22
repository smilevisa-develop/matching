/**
 * 一斉連絡用の WhatsApp テンプレートを Meta に審査申請する (要ログイン)。
 *
 * GET  /api/admin/whatsapp-template-submit              申請できるテンプレと現在の状態を返す (申請はしない)
 * POST /api/admin/whatsapp-template-submit?name=<名前>  そのテンプレを申請する
 *
 * 申請できるのは lib/broadcast-message.ts の TEMPLATE_DRAFTS に固定した文面だけ
 * (任意の文面を申請できないようにしている)。
 * 承認されると一斉連絡ページが自動で新しいテンプレを使い始める:
 *   - partner_job_offer_v16        … 求人情報に「■紹介料」の見出しが付く
 *   - partner_job_offer_notice_v1  … お知らせ (自由メッセージ) が WhatsApp にも届く
 * UTILITY で申請するが、Meta が MARKETING に分類した場合は WhatsApp には使われない
 * (MARKETING は単価が高いため。文面は LINE / メール 等にだけ使われる)。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import { TEMPLATE_DRAFTS, type TemplateDraftName } from "@/lib/broadcast-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v22.0";

function env() {
  const token = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID;
  if (!token || !wabaId) throw new Error("WA_ACCESS_TOKEN / WA_WABA_ID が未設定です");
  return { token, wabaId };
}

/** Meta 上の同名テンプレの状態 (無ければ null) */
async function currentStatus(name: string) {
  const { token, wabaId } = env();
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(name)}` +
      `&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    data?: { name: string; status: string; category: string; rejected_reason?: string }[];
  };
  return (data.data ?? []).find((t) => t.name === name) ?? null;
}

export async function GET() {
  try {
    await requireApiAccount();
    const out = [];
    for (const name of Object.keys(TEMPLATE_DRAFTS) as TemplateDraftName[]) {
      out.push({ name, requestedCategory: TEMPLATE_DRAFTS[name].category, meta: await currentStatus(name) });
    }
    return Response.json({ ok: true, templates: out });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const name = new URL(req.url).searchParams.get("name") ?? "";
    if (!(name in TEMPLATE_DRAFTS)) {
      return Response.json({ ok: false, error: `申請できないテンプレ名です: ${name}` }, { status: 400 });
    }
    const draft = TEMPLATE_DRAFTS[name as TemplateDraftName];

    // 二重申請しない (審査中・承認済みならそのまま状態を返す)
    const existing = await currentStatus(name);
    if (existing) {
      return Response.json({ ok: true, alreadyExists: true, meta: existing });
    }

    const { token, wabaId } = env();
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name,
        language: "ja",
        category: draft.category,
        components: [
          { type: "BODY", text: draft.body, example: { body_text: [[...draft.examples]] } },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { ok: false, error: data?.error?.error_user_msg ?? data?.error?.message ?? "申請に失敗しました", meta: data },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, submitted: true, meta: data });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
