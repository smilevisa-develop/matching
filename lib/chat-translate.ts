/**
 * チャット画面 (/chat) の訳文を作る。
 *
 * 担当者ごとに「表示言語」(StaffAccount.chatLanguage) を持ち、画面では訳文を大きく・原文を小さく出す。
 *   土田さん → 日本語 / トゥイさん・グエットさん → ベトナム語 / チンディさん → インドネシア語
 * 訳文は言語ごとに 1 度だけ作って MessageTranslation に保存し、使い回す。
 * LINE グループには何も送らない (メンバーに通知が増えないように)。
 *
 * 作るタイミング:
 *   - 受信・送信したとき (webhook / send-partner の after で、担当者が使っている言語ぶん)
 *   - 画面を開いたときに訳が無いもの (過去のメッセージ・失敗したもの)
 *
 * AI は Claude の軽いモデルを直接使う (短い文の翻訳なので重いモデルは要らない)。
 * 失敗したら訳なしのまま (原文を表示) にして、次に画面を開いたときにもう一度試す。
 * Gemini の無料枠は他の機能と共有なので、ここでは使わない。
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY     = lib/claude.ts と共通
 *   CHAT_TRANSLATE_MODEL  = 使うモデル (任意。既定 claude-haiku-5-5)
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { looksJapanese } from "@/lib/translate-ja";
import { CHAT_LANGUAGES, DRAFT_LANGUAGES, hasWords, isChatLang, type ChatLang, type DraftLang } from "@/lib/chat-languages";

export { CHAT_LANGUAGES, isChatLang, type ChatLang } from "@/lib/chat-languages";

const DEFAULT_MODEL = "claude-haiku-5-5";
/** 1 回の依頼で訳す件数 (多すぎると応答が遅くなる) */
const BATCH_SIZE = 20;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  client ??= new Anthropic();
  return client;
}

/** 同じメッセージを同時に 2 回訳しに行かないための覚え書き (プロセス内だけ) */
const inFlight = new Set<string>();

type AiItem = { id: number; lang?: string; translation?: string | null };

async function translateBatch(
  items: { id: number; text: string }[],
  target: ChatLang,
): Promise<AiItem[]> {
  const anthropic = getClient();
  if (!anthropic) return [];
  const targetName = CHAT_LANGUAGES.find((l) => l.code === target)!.aiName;

  const response = await anthropic.messages.create({
    model: process.env.CHAT_TRANSLATE_MODEL?.trim() || DEFAULT_MODEL,
    max_tokens: 8000,
    system: [
      "You translate LINE chat messages for a Japanese recruiting company that places Vietnamese and Indonesian workers in Japan.",
      "The chats are between Japanese staff, Vietnamese/Indonesian staff, candidates and partner agencies.",
      `Translate each message into natural, casual ${targetName} as a chat message would read.`,
      "Expand chat abbreviations and slang correctly (e.g. Vietnamese: đk=được, r=rồi, vs=với, cty=công ty, e=em; Indonesian: yg=yang, gak=tidak, sdh=sudah).",
      "Keep @mentions, personal names, company names, URLs, numbers, emoji and line breaks as they are.",
      "Also detect the language of each message as an ISO 639-1 code (ja, vi, id, en, ...).",
      `If a message is already in ${targetName}, set "translation" to null.`,
      'Reply with JSON only: [{"id": <id>, "lang": "<code>", "translation": "<text or null>"}, ...] with one entry per input message.',
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify(items) }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] ?? text;
  const parsed = JSON.parse(json) as unknown;
  return Array.isArray(parsed) ? (parsed as AiItem[]) : [];
}

/**
 * 指定したメッセージを target の言語に訳して保存する。
 * すでに訳があるもの・同じ言語のもの・文字が無いものは飛ばす。
 * 戻り値は「今回作った訳」と「判定した言語」。
 */
export async function translateMessages(
  messageIds: number[],
  target: ChatLang,
): Promise<{ translations: Record<number, string>; sourceLangs: Record<number, string> }> {
  const translations: Record<number, string> = {};
  const sourceLangs: Record<number, string> = {};
  if (messageIds.length === 0) return { translations, sourceLangs };

  const messages = await prisma.message.findMany({
    where: { id: { in: messageIds }, translations: { none: { lang: target } } },
    select: { id: true, content: true, sourceLang: true },
  });

  const todo: { id: number; text: string }[] = [];
  for (const m of messages) {
    if (!hasWords(m.content)) continue;
    // かなを含む文は日本語と分かるので AI に聞かない
    if (!m.sourceLang && looksJapanese(m.content)) {
      await prisma.message.update({ where: { id: m.id }, data: { sourceLang: "ja" } });
      sourceLangs[m.id] = "ja";
      if (target === "ja") continue;
    } else if (m.sourceLang === target) {
      continue;
    }
    const key = `${m.id}:${target}`;
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    todo.push({ id: m.id, text: m.content });
  }

  try {
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      let result: AiItem[] = [];
      try {
        result = await translateBatch(batch, target);
      } catch (e) {
        console.warn("[chat-translate] 翻訳に失敗:", e instanceof Error ? e.message : e);
        continue;
      }
      const asked = new Set(batch.map((b) => b.id));
      for (const r of result) {
        const id = Number(r.id);
        if (!asked.has(id)) continue;
        const lang = typeof r.lang === "string" ? r.lang.trim().toLowerCase().slice(0, 8) : "";
        if (lang) {
          await prisma.message.update({ where: { id }, data: { sourceLang: lang } });
          sourceLangs[id] = lang;
        }
        const out = typeof r.translation === "string" ? r.translation.trim() : "";
        if (out && lang !== target) translations[id] = out;
      }
    }
    const rows = Object.entries(translations).map(([id, text]) => ({ messageId: Number(id), lang: target, text }));
    if (rows.length > 0) await prisma.messageTranslation.createMany({ data: rows, skipDuplicates: true });
  } finally {
    for (const t of todo) inFlight.delete(`${t.id}:${target}`);
  }
  return { translations, sourceLangs };
}

/** 担当者が使っている表示言語すべてに訳す (受信・送信の直後に after で呼ぶ) */
export async function translateForAllStaff(messageId: number): Promise<void> {
  const accounts = await prisma.staffAccount.findMany({
    select: { chatLanguage: true },
    distinct: ["chatLanguage"],
  });
  const langs = accounts.map((a) => a.chatLanguage).filter(isChatLang);
  for (const lang of langs.length > 0 ? langs : (["ja"] as ChatLang[])) {
    await translateMessages([messageId], lang);
  }
}

/**
 * 入力欄の「翻訳」。送る前の文を相手の言語に訳し、確認用に担当者の表示言語へ訳し戻した文も返す
 * (担当者が読めない言語に訳したときも、意味が合っているか目で確かめてから送れるように)。
 */
export async function translateDraft(
  text: string,
  target: DraftLang,
  staffLang: ChatLang,
): Promise<{ translation: string; back: string | null }> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("翻訳の AI キーが未設定です");
  const targetName = DRAFT_LANGUAGES.find((l) => l.code === target)!.aiName;
  const staffName = CHAT_LANGUAGES.find((l) => l.code === staffLang)!.aiName;

  const response = await anthropic.messages.create({
    model: process.env.CHAT_TRANSLATE_MODEL?.trim() || DEFAULT_MODEL,
    max_tokens: 4000,
    system: [
      "You translate a chat message that staff of a Japanese recruiting company are about to send on LINE to candidates or partner agencies abroad.",
      `Translate it into natural, polite but friendly ${targetName} suitable for a chat message.`,
      "Keep @mentions, personal names, company names, URLs, numbers, emoji and line breaks as they are. Do not add anything.",
      `Then translate your translation back into ${staffName} as literally as possible, so the staff can check the meaning.`,
      'Reply with JSON only: {"translation": "<text>", "back": "<text>"}',
    ].join("\n"),
    messages: [{ role: "user", content: text }],
  });
  const out = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = out.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] ?? out;
  const parsed = JSON.parse(json) as { translation?: unknown; back?: unknown };
  const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
  if (!translation) throw new Error("翻訳できませんでした");
  const back = typeof parsed.back === "string" && parsed.back.trim() && target !== staffLang ? parsed.back.trim() : null;
  return { translation, back };
}
