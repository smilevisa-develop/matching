import { prisma } from "@/lib/prisma";
import {
  expandTemplate,
  dealToBroadcast,
  OPEN_DEAL_STATUSES,
  URGENT_DEAL_STATUSES,
  type DealForBroadcast,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";
import { sendEmail, textToBasicHtml, DEFAULT_EMAIL_SUBJECT } from "@/lib/email";

/** 配信時の案件スナップショットを 1 回だけ取得 */
async function loadDealSnapshot(): Promise<{
  openDeals: DealForBroadcast[];
  urgentDeals: DealForBroadcast[];
}> {
  const deals = await prisma.deal.findMany({
    where: { status: { in: [...OPEN_DEAL_STATUSES] } },
    include: { company: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  const mapped = deals.map(dealToBroadcast);
  return {
    openDeals: mapped,
    urgentDeals: mapped.filter((d) =>
      (URGENT_DEAL_STATUSES as readonly string[]).includes(d.status),
    ),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      mode,
      relationshipStatus,
      introNationality,
      introField,
      groupId,
      partnerIds,
      message,
      emailSubject: emailSubjectFromBody,
      scheduledAt,
      templateId,
    } = body as {
      mode: "filter" | "group";
      relationshipStatus: string | null;
      introNationality: string | null;
      introField: string | null;
      groupId: number | null;
      /**
       * 送信対象パートナーの ID 配列。クライアント側のプレビューと完全に一致する
       * 対象だけに送信するための明示的なホワイトリスト。
       * これが指定されている場合は、フィルタ条件は MessageLog 記録用にのみ使う。
       */
      partnerIds?: number[];
      message: string;
      /** メール件名 (UI で個別指定された場合)。優先順位: 本体 > テンプレ > デフォルト */
      emailSubject?: string | null;
      scheduledAt: string | null;
      /** MessageTemplate.id を渡すと、WhatsApp ではそのテンプレ承認名で送信できる */
      templateId?: number | null;
    };

    // ── 安全装置: partnerIds が明示指定されていない場合は送信を拒否する ──
    // プレビューと送信の不一致を防ぐため、フィルタ条件だけの送信は許可しない。
    if (!Array.isArray(partnerIds) || partnerIds.length === 0) {
      return Response.json(
        {
          ok: false,
          error:
            "送信対象パートナー (partnerIds) が指定されていません。プレビューに表示されたパートナーがそのまま送信対象になります。画面から正しく送信してください。",
        },
        { status: 400 }
      );
    }
    // 重複除去 + 数値検証 (同じ partner に複数送信しないため)
    const targetIds = [
      ...new Set(partnerIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)),
    ];
    if (targetIds.length === 0) {
      return Response.json(
        { ok: false, error: "送信対象パートナー ID が無効です" },
        { status: 400 }
      );
    }
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const fbPageToken = process.env.FB_PAGE_ACCESS_TOKEN;
    const waToken = process.env.WA_ACCESS_TOKEN;
    const waPhoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    if (!lineToken && !fbPageToken && !waToken) {
      return Response.json(
        { ok: false, error: "LINE / FB / WhatsApp いずれの送信トークンも未設定です" },
        { status: 500 }
      );
    }

    // 選択テンプレ (WhatsApp テンプレ名がある場合のみ意味を持つ)
    const tmpl = templateId
      ? await prisma.messageTemplate.findUnique({ where: { id: templateId } })
      : null;
    const waTemplate =
      tmpl?.whatsappTemplateName && tmpl?.whatsappTemplateLang
        ? {
            name: tmpl.whatsappTemplateName,
            lang: tmpl.whatsappTemplateLang,
            paramKeys: (tmpl.whatsappTemplateParams ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : null;

    // 対象パートナー取得
    type Target = {
      id: number;
      name: string;
      contactName: string | null;
      country: string | null;
      introducibleFields: string | null;
      lineUserId: string | null;
      /** 紐づけ済み LINE グループの groupId (会社単位の配信先) */
      lineGroupId: string | null;
      messengerPsid: string | null;
      whatsappId: string | null;
      email: string | null;
      /** 主な連絡手段 (channel) — メール送信判定に使う */
      channel: string | null;
      /** Messenger Recurring Notifications 購読 token (有効なら 24h 縛り無し) */
      messengerSubscriptionToken: string | null;
      messengerSubscriptionStatus: string | null;
      messengerSubscriptionExpiresAt: Date | null;
    };
    // 明示指定された partnerIds の partner のみを取得 (フィルタ再評価せず)
    const partners = await prisma.partner.findMany({
      where: { id: { in: targetIds } },
      include: {
        lineGroups: {
          where: { isActive: true },
          orderBy: { lastSeenAt: "desc" as const },
          take: 1,
        },
        contacts: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });
    // 戻り順を partnerIds の指定順に並び替え (UI 上の表示順と一致させる)
    const partnersById = new Map(partners.map((p) => [p.id, p]));
    const orderedPartners = targetIds
      .map((id) => partnersById.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const targets: Target[] = orderedPartners.map((p) => ({
      id: p.id,
      name: p.name,
      // メール配信宛先: 主担当の担当者名 (フォールバックで legacy Partner.contactName)
      contactName: p.contacts[0]?.name ?? p.contactName,
      country: p.country,
      introducibleFields: p.introducibleFields,
      lineUserId: p.lineUserId,
      lineGroupId: p.lineGroups[0]?.groupId ?? null,
      messengerPsid: p.messengerPsid,
      whatsappId: p.whatsappId,
      // メール: 主担当のメアド (フォールバックで legacy Partner.email)
      email: p.contacts[0]?.email ?? p.email,
      channel: p.channel,
      messengerSubscriptionToken: p.messengerSubscriptionToken,
      messengerSubscriptionStatus: p.messengerSubscriptionStatus,
      messengerSubscriptionExpiresAt: p.messengerSubscriptionExpiresAt,
    }));

    // 変数展開のため案件スナップショットを 1 回ロード
    const { openDeals, urgentDeals } = await loadDealSnapshot();
    const renderFor = (t: Target): string => {
      const partner: PartnerForBroadcast = {
        name: t.name,
        contactName: t.contactName,
        country: t.country,
        introducibleFields: t.introducibleFields,
      };
      return expandTemplate(message, { partner, openDeals, urgentDeals });
    };

    if (scheduledAt) {
      await prisma.messageLog.create({
        data: {
          title: "予約配信 (パートナー)",
          body: message,
          channel: "LINE/Messenger/WhatsApp",
          targetFilter: JSON.stringify({
            mode,
            relationshipStatus,
            introNationality,
            introField,
            groupId,
            partnerIds: targetIds,
          }),
          status: "scheduled",
          matchedCount: targets.length,
          sentCount: 0,
          skippedCount: 0,
          scheduledAt: new Date(scheduledAt),
        },
      });
      return Response.json({ ok: true, targetCount: targets.length, scheduledAt });
    }

    // 即時送信: LINE → WhatsApp → Messenger の順で試す
    let sentCount = 0;
    let sentLine = 0;
    let sentWhatsapp = 0;
    let sentMessenger = 0;
    let sentEmail = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failures: { name: string; channel: string; error: string }[] = [];

    /** ヘルパー: 1 受信者ぶんの WhatsApp テンプレ用パラメータを組み立てる */
    const buildWaTemplateParams = (t: Target): string[] => {
      if (!waTemplate) return [];
      const partner: PartnerForBroadcast = {
        name: t.name,
        contactName: t.contactName,
        country: t.country,
        introducibleFields: t.introducibleFields,
      };
      // 変数キー (例: "急ぎ案件一覧") を {{xxx}} 文字列にラップして expandTemplate で 1 個ずつ展開
      return waTemplate.paramKeys.map((key) =>
        expandTemplate(`{{${key}}}`, { partner, openDeals, urgentDeals })
      );
    };

    /** LINE で送る */
    const sendLine = async (to: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!lineToken) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: await res.text() };
    };

    /**
     * WhatsApp Cloud API で送る。
     * - テンプレ (waTemplate) が指定されていれば承認済みテンプレで送る (24h 縛りなし)
     * - 無ければ free-form text (24h 内のみ届く)
     */
    const sendWhatsapp = async (
      waId: string,
      text: string,
      templateParams: string[]
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!waToken || !waPhoneNumberId) {
        return { ok: false, error: "WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID 未設定" };
      }
      const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
        waPhoneNumberId
      )}/messages`;
      let payload: Record<string, unknown>;
      if (waTemplate) {
        payload = {
          messaging_product: "whatsapp",
          to: waId,
          type: "template",
          template: {
            name: waTemplate.name,
            language: { code: waTemplate.lang },
            components:
              templateParams.length > 0
                ? [
                    {
                      type: "body",
                      parameters: templateParams.map((p) => ({
                        type: "text",
                        text: p,
                      })),
                    },
                  ]
                : [],
          },
        };
      } else {
        payload = {
          messaging_product: "whatsapp",
          to: waId,
          type: "text",
          text: { body: text },
        };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${waToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: await res.text() };
    };

    /**
     * Messenger (Facebook Graph API) で送る。
     * - 購読 token (Recurring Notifications) があればそれを優先 (24h 関係なく送れる)
     * - 無ければ通常の RESPONSE タイプ (24h ウィンドウ内のみ届く)
     */
    const sendMessenger = async (
      psid: string,
      text: string,
      subscriptionToken?: string | null
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!fbPageToken) return { ok: false, error: "FB_PAGE_ACCESS_TOKEN 未設定" };
      const url = `https://graph.facebook.com/v22.0/me/messages?access_token=${encodeURIComponent(fbPageToken)}`;
      const payload = subscriptionToken
        ? {
            // Recurring Notifications: token 指定で 24h 関係なく送れる
            recipient: { notification_messages_token: subscriptionToken },
            message: { text },
          }
        : {
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: { text },
          };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: await res.text() };
    };

    let sentLineGroup = 0;
    for (const t of targets) {
      const personalizedMessage = renderFor(t);

      // 「主な連絡手段」 (t.channel) で送信経路を決める。
      // 該当 ID が無ければ failed (他経路へのフォールバックはしない)。
      const ch = t.channel ?? "";

      // === LINE 経路 (グループ → 個人 の順、両方無いと失敗) ===
      if (ch === "LINE") {
        if (t.lineGroupId) {
          const r = await sendLine(t.lineGroupId, personalizedMessage);
          if (r.ok) {
            sentCount++;
            sentLineGroup++;
          } else {
            failedCount++;
            failures.push({ name: t.name, channel: "LINE-Group", error: r.error });
          }
        } else if (t.lineUserId) {
          const r = await sendLine(t.lineUserId, personalizedMessage);
          if (r.ok) {
            sentCount++;
            sentLine++;
          } else {
            failedCount++;
            failures.push({ name: t.name, channel: "LINE", error: r.error });
          }
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "LINE", error: "LINE ID 未登録 (主な連絡手段=LINE)" });
        }
        continue;
      }

      // === WhatsApp ===
      if (ch === "WhatsApp") {
        if (t.whatsappId) {
          const params = buildWaTemplateParams(t);
          const r = await sendWhatsapp(t.whatsappId, personalizedMessage, params);
          if (r.ok) {
            sentCount++;
            sentWhatsapp++;
          } else {
            failedCount++;
            failures.push({ name: t.name, channel: "WhatsApp", error: r.error });
          }
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "WhatsApp", error: "WhatsApp 番号未登録" });
        }
        continue;
      }

      // === Messenger ===
      if (ch === "Messenger") {
        if (t.messengerPsid) {
          // 購読 token が有効 (ACTIVE + 期限内) なら、それで送信 (24h 関係なし)
          const subToken =
            t.messengerSubscriptionStatus === "ACTIVE" &&
            t.messengerSubscriptionToken &&
            (!t.messengerSubscriptionExpiresAt || t.messengerSubscriptionExpiresAt > new Date())
              ? t.messengerSubscriptionToken
              : null;
          const r = await sendMessenger(t.messengerPsid, personalizedMessage, subToken);
          if (r.ok) {
            sentCount++;
            sentMessenger++;
          } else {
            failedCount++;
            failures.push({ name: t.name, channel: "Messenger", error: r.error });
          }
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "Messenger", error: "Messenger PSID 未登録" });
        }
        continue;
      }

      // === メール ===
      if (ch === "mail" || ch === "メール" || ch === "Email") {
        const emailOk = Boolean(t.email && /@/.test(t.email));
        if (emailOk && t.email) {
          const partnerCtx: PartnerForBroadcast = {
            name: t.name,
            contactName: t.contactName,
            country: t.country,
            introducibleFields: t.introducibleFields,
          };
          const subjectTemplate =
            emailSubjectFromBody?.trim() ||
            tmpl?.emailSubject?.trim() ||
            DEFAULT_EMAIL_SUBJECT;
          const subject = expandTemplate(subjectTemplate, {
            partner: partnerCtx,
            openDeals,
            urgentDeals,
          });
          const r = await sendEmail({
            to: t.email,
            subject,
            text: personalizedMessage,
            html: textToBasicHtml(personalizedMessage),
          });
          if (r.ok) {
            sentCount++;
            sentEmail++;
            await prisma.message.create({
              data: {
                partnerId: t.id,
                channel: "Email",
                direction: "outbound",
                content: personalizedMessage,
                externalId: t.email,
              },
            });
          } else {
            failedCount++;
            failures.push({ name: t.name, channel: "Email", error: r.error });
          }
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "Email", error: "メールアドレス未登録 or 形式不正" });
        }
        continue;
      }

      // === 主な連絡手段が未設定 or 不明 ===
      failedCount++;
      failures.push({
        name: t.name,
        channel: "-",
        error: "主な連絡手段が未設定です。パートナー詳細で設定してください",
      });
    }

    await prisma.messageLog.create({
      data: {
        title: "一斉配信 (パートナー)",
        body: message,
        channel: "LINE+Messenger",
        targetFilter: JSON.stringify({
          mode,
          relationshipStatus,
          introNationality,
          introField,
          groupId,
          partnerIds: targetIds,
        }),
        status: "done",
        matchedCount: targets.length,
        sentCount,
        skippedCount,
        failedCount,
        failures: failures.length > 0 ? failures : undefined,
      },
    });

    return Response.json({
      ok: true,
      sentCount,
      sentLineGroup,
      sentLine,
      sentWhatsapp,
      sentMessenger,
      sentEmail,
      failedCount,
      skippedCount,
      failures,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
