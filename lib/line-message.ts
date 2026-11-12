/**
 * LINE Messaging API に送る text メッセージを組み立てる。
 *
 * 一斉配信のグループ宛てだけ、全員にメンション (@All) を付ける (Text message v2 の substitution)。
 * パートナーは複数のグループに入っていて、メンションが無いと気づかれにくいため (2026/10 採用チームの依頼)。
 * チャットからの送信には付けない (2026/10 土田さん)。
 * 個人宛て (userId が "U" 始まり) ではメンションは使えないので通常の text で送る。
 *
 * 仕様: https://developers.line.biz/en/reference/messaging-api/#text-message-v2
 *   - mention は push / reply のみ、宛先はグループ or 複数人トーク
 *   - substitution のキーは英数字と _ のみ
 */

/** LINE のグループID / 複数人トークID か (C = group, R = room) */
export function isLineGroupId(to: string): boolean {
  return /^[CR]/.test(to);
}

/** `{` `}` は v2 では置換記号になるので、本文に含まれるものを全角に逃がす */
function escapeV2Text(text: string): string {
  return text.replace(/\{/g, "｛").replace(/\}/g, "｝");
}

export function buildLineTextMessage(to: string, text: string, opts?: { mentionAll?: boolean }): Record<string, unknown> {
  if (!opts?.mentionAll || !isLineGroupId(to)) return { type: "text", text };
  return {
    type: "textV2",
    text: `{everyone}\n${escapeV2Text(text)}`,
    substitution: {
      everyone: { type: "mention", mentionee: { type: "all" } },
    },
  };
}

/**
 * 引用して返信するとき (チャット画面の「返信」)。返信先のメッセージ (Message.id) から、
 * 送るメッセージに付ける quoteToken と、保存する引用元の LINE メッセージID を引く。
 * 宛先が違うトークのメッセージや、引用トークンが無い (古い・LINE 以外) メッセージなら引用しない。
 * 仕様: https://developers.line.biz/en/docs/messaging-api/get-quote-tokens/
 */
export async function findLineQuote(replyToMessageId: unknown, to: string): Promise<{ quoteToken: string; quotedLineMessageId: string | null } | null> {
  const id = Number(replyToMessageId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { prisma } = await import("@/lib/prisma");
  const m = await prisma.message.findUnique({ where: { id }, select: { quoteToken: true, lineMessageId: true, externalId: true } });
  if (!m?.quoteToken || m.externalId !== to) return null;
  return { quoteToken: m.quoteToken, quotedLineMessageId: m.lineMessageId };
}

/** push の応答から、送ったメッセージの LINE メッセージID と引用トークン (あとでこのメッセージを引用できるように) */
export async function readPushSent(res: Response): Promise<{ lineMessageId: string | null; quoteToken: string | null }> {
  try {
    const json = (await res.json()) as { sentMessages?: { id?: string; quoteToken?: string }[] };
    const first = json.sentMessages?.[0];
    return { lineMessageId: first?.id ?? null, quoteToken: first?.quoteToken ?? null };
  } catch {
    return { lineMessageId: null, quoteToken: null };
  }
}
