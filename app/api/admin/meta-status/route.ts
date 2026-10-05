/**
 * Meta (WhatsApp / Messenger) の接続状態を確認する (要ログイン)。
 *
 * GET /api/admin/meta-status
 *
 * 一斉連絡で「WhatsApp に送れない」「Messenger に送れない」が起きたときの切り分け用。
 * トークンの有効性と、送信先が登録されているパートナー数を返す。トークン本体は返さない。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v22.0";

/** Meta のエラーを短く読める形にする */
function describe(data: unknown): string {
  const e = (data as { error?: { message?: string; code?: number } })?.error;
  if (!e) return "OK";
  return `${e.code ?? "?"}: ${e.message ?? "エラー"}`;
}

export async function GET() {
  try {
    await requireApiAccount();

    const waToken = process.env.WA_ACCESS_TOKEN?.trim();
    const wabaId = process.env.WA_WABA_ID?.trim();
    const waPhoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
    const fbPageToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();

    const whatsapp: Record<string, unknown> = {
      tokenSet: Boolean(waToken),
      wabaIdSet: Boolean(wabaId),
      phoneNumberIdSet: Boolean(waPhoneNumberId),
    };
    if (waToken && wabaId) {
      try {
        const res = await fetch(
          `${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?limit=1&fields=name,status` +
            `&access_token=${encodeURIComponent(waToken)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        whatsapp.tokenOk = res.ok;
        whatsapp.detail = describe(data);
      } catch (e) {
        whatsapp.tokenOk = false;
        whatsapp.detail = e instanceof Error ? e.message : "error";
      }
    }

    const messenger: Record<string, unknown> = { tokenSet: Boolean(fbPageToken) };
    if (fbPageToken) {
      try {
        const res = await fetch(
          `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(fbPageToken)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        messenger.tokenOk = res.ok;
        messenger.detail = res.ok ? `ページ: ${data?.name ?? data?.id ?? "?"}` : describe(data);
      } catch (e) {
        messenger.tokenOk = false;
        messenger.detail = e instanceof Error ? e.message : "error";
      }
    }

    // 送信先が登録されているパートナー数 (トークンが有効でも、宛先が無ければ送れない)
    const [waTargets, waWithId, msgTargets, msgWithPsid] = await Promise.all([
      prisma.partner.count({ where: { preferredChannels: { contains: "WhatsApp" } } }),
      prisma.partner.count({
        where: { preferredChannels: { contains: "WhatsApp" }, whatsappId: { not: null } },
      }),
      prisma.partner.count({ where: { preferredChannels: { contains: "Messenger" } } }),
      prisma.partner.count({
        where: { preferredChannels: { contains: "Messenger" }, messengerPsid: { not: null } },
      }),
    ]);
    whatsapp.partners = { selected: waTargets, withWhatsappId: waWithId };
    messenger.partners = { selected: msgTargets, withPsid: msgWithPsid };

    return Response.json({ ok: true, whatsapp, messenger });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
