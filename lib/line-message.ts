/**
 * LINE Messaging API に送る text メッセージを組み立てる。
 *
 * グループ宛てのときは全員にメンション (@All) を付ける (Text message v2 の substitution)。
 * パートナーは複数のグループに入っていて、メンションが無いと気づかれにくいため (2026/10 採用チームの依頼)。
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
  const mentionAll = opts?.mentionAll ?? true;
  if (!mentionAll || !isLineGroupId(to)) return { type: "text", text };
  return {
    type: "textV2",
    text: `{everyone}\n${escapeV2Text(text)}`,
    substitution: {
      everyone: { type: "mention", mentionee: { type: "all" } },
    },
  };
}
