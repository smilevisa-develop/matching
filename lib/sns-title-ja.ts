/**
 * SNS の動画の題名 (インドネシア語・ベトナム語) の日本語訳。SNS ページのグラフと動画の表で、日本語を大きく・元の題名を小さく出す。
 * 同じ題名は 1 度だけ訳して SnsTitleJa に残し、次からはそれを使う。訳がまだ無い題名は、ページを開いたときにまとめて訳す。
 * AI は Claude の軽いモデル (チャットの翻訳 lib/chat-translate.ts と同じ。ANTHROPIC_API_KEY / CHAT_TRANSLATE_MODEL)。
 * 失敗したら元の題名のまま出して、次に開いたときにもう一度試す。
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { looksJapanese } from "@/lib/translate-ja";

const keyOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

let client: Anthropic | null = null;

async function translate(titles: string[]): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: process.env.CHAT_TRANSLATE_MODEL?.trim() || "claude-haiku-5-5",
    max_tokens: 4000,
    system: [
      "You translate titles of short SNS videos into natural Japanese.",
      "The videos are posted by a Japanese recruiting company for Indonesian and Vietnamese people who want to work in Japan (Japanese phrases, job interview manners, life in Japan).",
      "Keep each translation short like a title. Drop emoji.",
      'Reply with JSON only: an array of strings, one Japanese translation per input title, in the same order.',
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify(titles) }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] ?? text;
  const parsed = JSON.parse(json) as unknown;
  return Array.isArray(parsed) && parsed.length === titles.length ? parsed.map((x) => (typeof x === "string" ? x.trim() : "")) : null;
}

/** 題名 → 日本語訳。日本語の題名・訳せなかった題名は入らない */
export async function japaneseTitles(titles: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(titles.map((t) => t.trim()).filter((t) => t && !looksJapanese(t)))];
  const out = new Map<string, string>();
  if (uniq.length === 0) return out;
  const saved = await prisma.snsTitleJa.findMany({ where: { key: { in: uniq.map(keyOf) } } });
  const byKey = new Map(saved.map((r) => [r.key, r.ja]));
  const todo: string[] = [];
  for (const t of uniq) {
    const ja = byKey.get(keyOf(t));
    if (ja) out.set(t, ja);
    else todo.push(t);
  }
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    try {
      const res = await translate(batch);
      if (!res) continue;
      const rows = batch.map((source, j) => ({ key: keyOf(source), source, ja: res[j] })).filter((r) => r.ja);
      for (const r of rows) out.set(r.source, r.ja);
      if (rows.length) await prisma.snsTitleJa.createMany({ data: rows, skipDuplicates: true });
    } catch (e) {
      console.warn("[sns-title-ja] 翻訳に失敗:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}
