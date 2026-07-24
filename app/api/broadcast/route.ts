import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  expandTemplate,
  dealToBroadcast,
  OPEN_DEAL_STATUSES,
  URGENT_DEAL_STATUSES,
  type DealForBroadcast,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";
import { sendEmail, textToBasicHtml, DEFAULT_EMAIL_SUBJECT, type EmailAttachment } from "@/lib/email";
import { publicUrl } from "@/lib/public-url";
import { incrementChannelUsage } from "@/lib/channel-usage";

/** LINE / メール 用に添付画像をまとめて事前ロード */
type LoadedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  /** 公開絶対 URL (LINE の originalContentUrl 用) */
  publicAbsUrl: string;
  /** メール添付用に base64 化したバイト列 (オンデマンド計算で OK だが、毎パートナーで再計算しないよう先に持っておく) */
  dataBase64: string;
};

/** 添付画像を id 配列から事前ロード。最大 4 件 (LINE の 1push 5 message 制約 = text 1 + image 4) */
async function loadAttachments(ids: string[]): Promise<{
  loaded: LoadedAttachment[];
  skipped: { id: string; reason: string }[];
}> {
  const loaded: LoadedAttachment[] = [];
  const skipped: { id: string; reason: string }[] = [];
  if (!ids || ids.length === 0) return { loaded, skipped };

  // 最大 4 件まで採用 (LINE 制約)。残りは skipped に記録。
  const usableIds = ids.slice(0, 4);
  if (ids.length > 4) {
    for (const extra of ids.slice(4)) {
      skipped.push({ id: extra, reason: "添付は最大 4 件まで (LINE: 1push 5 message 制約)" });
    }
  }

  const files = await prisma.uploadedFile.findMany({
    where: { id: { in: usableIds } },
    select: { id: true, filename: true, mimeType: true, data: true, expiresAt: true },
  });
  const filesById = new Map(files.map((f) => [f.id, f]));

  for (const id of usableIds) {
    const f = filesById.get(id);
    if (!f) {
      skipped.push({ id, reason: "ファイルが見つかりません" });
      continue;
    }
    if (f.expiresAt && f.expiresAt.getTime() < Date.now()) {
      skipped.push({ id, reason: "ファイルの有効期限切れです" });
      continue;
    }
    if (!["image/jpeg", "image/png"].includes(f.mimeType)) {
      skipped.push({ id, reason: `画像のみ対応 (受信: ${f.mimeType})` });
      continue;
    }
    loaded.push({
      id: f.id,
      filename: f.filename,
      mimeType: f.mimeType,
      publicAbsUrl: publicUrl(`/api/files/${f.id}`),
      dataBase64: Buffer.from(f.data).toString("base64"),
    });
  }

  return { loaded, skipped };
}

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

/** WhatsApp テンプレの本文パラメータで「ログインアカウントの姓」を差す特殊ソース */
const ACCOUNT_LASTNAME_SOURCE = "account:姓";
/** フルネームから姓 (先頭の語) を取り出す。スペースが無ければ全体を姓とみなす。 */
function deriveLastName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export async function POST(req: Request) {
  try {
    const account = await requireApiAccount();
    const senderLastName = deriveLastName(account.name);
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
      fileIds,
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
      /** 添付画像 (UploadedFile.id 配列、最大 4 件)。LINE 用に image message、メール用に添付。 */
      fileIds?: string[];
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
    // whatsappTemplateParams は各 {{n}} の指定を並べた JSON 配列:
    //   { auto: "パートナー名" | "担当者名" | "account:姓" } … 送信時に自動解決
    //   { value: "介護" }                                   … テンプレに保存した固定値
    let paramSpecs: Array<{ auto?: string; value?: string }> = [];
    try {
      const parsed = JSON.parse(tmpl?.whatsappTemplateParams ?? "[]");
      if (Array.isArray(parsed)) paramSpecs = parsed;
    } catch {
      paramSpecs = [];
    }
    const waTemplate =
      tmpl?.whatsappTemplateName && tmpl?.whatsappTemplateLang
        ? { name: tmpl.whatsappTemplateName, lang: tmpl.whatsappTemplateLang, specs: paramSpecs }
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
      /** レガシー: 主な連絡手段 (channel) — 後方互換用 */
      channel: string | null;
      /** 新: 一括送信で使う連絡手段の複数選択 (CSV → 配列) */
      preferredChannels: string[];
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
    const targets: Target[] = orderedPartners.map((p) => {
      // preferredChannels の解決: CSV → 配列 → 空なら channel (レガシー) から復元
      const parsedPreferred = (p.preferredChannels ?? "")
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const preferredChannels =
        parsedPreferred.length > 0 ? parsedPreferred : p.channel ? [p.channel] : [];
      return {
        id: p.id,
        name: p.name,
        // 担当者名/メール は 直下フィールドを優先、PartnerContact 主担当をフォールバック
        contactName: p.contactName ?? p.contacts[0]?.name ?? null,
        country: p.country,
        introducibleFields: p.introducibleFields,
        lineUserId: p.lineUserId,
        lineGroupId: p.lineGroups[0]?.groupId ?? null,
        messengerPsid: p.messengerPsid,
        whatsappId: p.whatsappId,
        email: p.email ?? p.contacts[0]?.email ?? null,
        channel: p.channel,
        preferredChannels,
        messengerSubscriptionToken: p.messengerSubscriptionToken,
        messengerSubscriptionStatus: p.messengerSubscriptionStatus,
        messengerSubscriptionExpiresAt: p.messengerSubscriptionExpiresAt,
      };
    });

    // 変数展開のため案件スナップショットを 1 回ロード
    const { openDeals, urgentDeals } = await loadDealSnapshot();

    // 添付画像を事前ロード (LINE / メール 共通で使う)
    const { loaded: attachments, skipped: attachmentSkipped } = await loadAttachments(
      Array.isArray(fileIds) ? fileIds.filter((s): s is string => typeof s === "string" && s.length > 0) : []
    );
    /** Apps Script に渡す添付フォーマット */
    const emailAttachments: EmailAttachment[] = attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      dataBase64: a.dataBase64,
    }));
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
    const skippedCount = 0;
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
      // 各 {{n}} を値に解決する:
      //   { value } → テンプレに保存した固定値
      //   { auto: "account:姓" } → ログイン中アカウントの姓
      //   { auto: 配信変数 }     → {{xxx}} を expandTemplate で展開 (パートナーごと)
      // WhatsApp テンプレ本文パラメータは改行・タブ・5 連続スペース禁止のため、必ず 1 行へ正規化する。
      return waTemplate.specs.map((spec) => {
        let raw = "";
        if (spec.value !== undefined) {
          raw = spec.value;
        } else if (spec.auto === ACCOUNT_LASTNAME_SOURCE) {
          raw = senderLastName;
        } else if (spec.auto) {
          raw = expandTemplate(`{{${spec.auto}}}`, { partner, openDeals, urgentDeals });
        }
        return raw.replace(/\s+/g, " ").trim();
      });
    };

    /**
     * LINE で送る (テキスト + 画像 0〜4 枚)。
     * 1 push で text 1 + image N 個を同梱送信できる (max 5 message)。
     * 画像が無ければ従来通り text のみ。
     */
    const sendLine = async (
      to: string,
      text: string,
      images: LoadedAttachment[]
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!lineToken) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
      const messages: Array<Record<string, unknown>> = [{ type: "text", text }];
      for (const img of images.slice(0, 4)) {
        messages.push({
          type: "image",
          originalContentUrl: img.publicAbsUrl,
          previewImageUrl: img.publicAbsUrl,
        });
      }
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
        body: JSON.stringify({ to, messages }),
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

    // 各チャネル別の送信ロジック (per-partner, per-channel)
    const sendViaLine = async (t: Target, personalizedMessage: string) => {
      const lineMsgCount = 1 + Math.min(attachments.length, 4);
      if (t.lineGroupId) {
        const r = await sendLine(t.lineGroupId, personalizedMessage, attachments);
        if (r.ok) {
          sentCount++;
          sentLineGroup++;
          await incrementChannelUsage("LINE", lineMsgCount);
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "LINE-Group", error: r.error });
        }
      } else if (t.lineUserId) {
        const r = await sendLine(t.lineUserId, personalizedMessage, attachments);
        if (r.ok) {
          sentCount++;
          sentLine++;
          await incrementChannelUsage("LINE", lineMsgCount);
        } else {
          failedCount++;
          failures.push({ name: t.name, channel: "LINE", error: r.error });
        }
      } else {
        failedCount++;
        failures.push({ name: t.name, channel: "LINE", error: "LINE ID 未登録" });
      }
    };

    const sendViaWhatsapp = async (t: Target, personalizedMessage: string) => {
      if (!t.whatsappId) {
        failedCount++;
        failures.push({ name: t.name, channel: "WhatsApp", error: "WhatsApp 番号未登録" });
        return;
      }
      const params = buildWaTemplateParams(t);
      const r = await sendWhatsapp(t.whatsappId, personalizedMessage, params);
      if (r.ok) {
        sentCount++;
        sentWhatsapp++;
        await incrementChannelUsage("WhatsApp", 1);
      } else {
        failedCount++;
        failures.push({ name: t.name, channel: "WhatsApp", error: r.error });
      }
    };

    const sendViaMessenger = async (t: Target, personalizedMessage: string) => {
      if (!t.messengerPsid) {
        failedCount++;
        failures.push({ name: t.name, channel: "Messenger", error: "Messenger PSID 未登録" });
        return;
      }
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
        await incrementChannelUsage("Messenger", 1);
      } else {
        failedCount++;
        failures.push({ name: t.name, channel: "Messenger", error: r.error });
      }
    };

    const sendViaEmail = async (t: Target, personalizedMessage: string) => {
      const emailOk = Boolean(t.email && /@/.test(t.email));
      if (!emailOk || !t.email) {
        failedCount++;
        failures.push({ name: t.name, channel: "Email", error: "メールアドレス未登録 or 形式不正" });
        return;
      }
      const partnerCtx: PartnerForBroadcast = {
        name: t.name,
        contactName: t.contactName,
        country: t.country,
        introducibleFields: t.introducibleFields,
      };
      const subjectTemplate =
        emailSubjectFromBody?.trim() || tmpl?.emailSubject?.trim() || DEFAULT_EMAIL_SUBJECT;
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
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      });
      if (r.ok) {
        sentCount++;
        sentEmail++;
        await incrementChannelUsage("Email", 1);
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
    };

    // ─────────────────────────────────────────────
    // メインの送信ループ:
    //   partner.preferredChannels の 全チャネル に対して送信を実行
    //   (メール + LINE 両方選択されていれば両方に送る)
    // ─────────────────────────────────────────────
    for (const t of targets) {
      const personalizedMessage = renderFor(t);

      if (t.preferredChannels.length === 0) {
        failedCount++;
        failures.push({
          name: t.name,
          channel: "-",
          error: "連絡手段が未設定です。パートナー詳細で設定してください",
        });
        continue;
      }

      // 各チャネルに 順次 送信
      for (const ch of t.preferredChannels) {
        if (ch === "LINE") {
          await sendViaLine(t, personalizedMessage);
        } else if (ch === "WhatsApp") {
          await sendViaWhatsapp(t, personalizedMessage);
        } else if (ch === "Messenger") {
          await sendViaMessenger(t, personalizedMessage);
        } else if (ch === "mail" || ch === "メール" || ch === "Email") {
          await sendViaEmail(t, personalizedMessage);
        }
        // それ以外 (「未設定」等) はスキップ
      }
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
      attachmentCount: attachments.length,
      attachmentSkipped,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
