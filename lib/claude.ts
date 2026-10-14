/**
 * 画像・PDF・文章だけの AI 依頼を Claude で処理する (Gemini の無料枠切れ対策)。
 *
 * 呼び出し側は Gemini 形式の依頼 (contents / parts / inlineData) のまま。
 * lib/gemini-keys.ts の generateContentRotating がここを先に試し、
 * 次の場合は null を返して Gemini に任せる:
 *   - ANTHROPIC_API_KEY が未設定
 *   - 音声など Claude が受け付けない添付がある (日本語チェック・面接練習の聞き取り)
 * Claude 側の失敗 (クレジット切れなど) は例外にして、呼び出し元で Gemini に切り替える。
 *
 * 費用: Max プランに付く月 $100 の API クレジットの範囲で使う。
 *   使い切ると API が止まるだけで追加請求はない (自動チャージはオフ)。
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY = Claude Console で発行したキー
 *   CLAUDE_MODEL      = 使うモデル (任意。既定 claude-opus-5-5)
 *   CLAUDE_EFFORT     = 考える量 low / medium / high (任意。既定 low)
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high";

function claudeEffort(): Effort {
  const v = process.env.CLAUDE_EFFORT?.trim().toLowerCase();
  return v === "medium" || v === "high" ? v : "low";
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  client ??= new Anthropic();
  return client;
}

// Gemini 形式の依頼のうち、ここで扱う部分だけの型
type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
export type GeminiLikeParams = {
  contents?: unknown;
  config?: { responseMimeType?: string; systemInstruction?: unknown };
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Gemini の part を Claude のブロックに直す。扱えない添付なら null */
function toBlock(part: GeminiPart): Anthropic.Beta.BetaContentBlockParam | null {
  if (typeof part.text === "string") return { type: "text", text: part.text };
  const mime = part.inlineData?.mimeType ?? "";
  const data = part.inlineData?.data ?? "";
  if (IMAGE_TYPES.has(mime)) {
    return {
      type: "image",
      source: { type: "base64", media_type: mime as "image/jpeg", data },
    };
  }
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return null;
}

function toMessages(contents: unknown): Anthropic.Beta.BetaMessageParam[] | null {
  if (typeof contents === "string") return [{ role: "user", content: contents }];
  if (!Array.isArray(contents)) return null;
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const c of contents as GeminiContent[]) {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const part of c.parts ?? []) {
      const block = toBlock(part);
      if (!block) return null;
      blocks.push(block);
    }
    if (blocks.length > 0) messages.push({ role: c.role === "model" ? "assistant" : "user", content: blocks });
  }
  return messages.length > 0 ? messages : null;
}

function systemText(config: GeminiLikeParams["config"]): string {
  const lines: string[] = [];
  const si = config?.systemInstruction;
  if (typeof si === "string") lines.push(si);
  else if (si && typeof si === "object") {
    for (const p of (si as GeminiContent).parts ?? []) if (p.text) lines.push(p.text);
  }
  if (config?.responseMimeType === "application/json") {
    lines.push("回答は JSON を 1 つだけ返してください。説明文や Markdown のコードブロックは付けないでください。");
  }
  return lines.join("\n\n");
}

/** 返ってきた文章から ``` で囲まれた JSON の囲みを外す */
function stripFence(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : text.trim();
}

/**
 * Claude で処理して Gemini と同じく { text } を返す。
 * Claude で扱わない依頼なら null (呼び出し元が Gemini で処理する)。
 */
export async function generateWithClaude(params: GeminiLikeParams): Promise<{ text: string } | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  const messages = toMessages(params.contents);
  if (!messages) return null;

  const system = systemText(params.config);
  const response = await anthropic.beta.messages.create({
    model: process.env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
    max_tokens: 16000,
    ...(system ? { system } : {}),
    messages,
    // 書類の読み取りや翻訳は考え込む作業ではないので、考える量は少なめ (費用も抑える)
    output_config: { effort: claudeEffort() },
    // 安全側の判定で断られたときは、別のモデルで自動的にやり直す
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude が処理を断りました (${response.stop_details?.category ?? "理由不明"})`);
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error(`Claude の応答が空でした (stop_reason=${response.stop_reason})`);
  return { text: params.config?.responseMimeType === "application/json" ? stripFence(text) : text };
}
