/**
 * Gemini の設定確認 (要ログイン)。AI 取込が 404 等で失敗したときの切り分け用。
 *
 * GET /api/admin/gemini-status
 *   → 現在の GEMINI_MODEL / キーの本数 / そのキーで使えるモデル一覧 /
 *     実際に 1 回呼んでみた結果 を返す。
 *
 * キーそのものは返さない (先頭 6 文字だけ)。
 */

import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  DEFAULT_GEMINI_MODEL,
  getGeminiKeys,
  getGeminiModel,
  generateContentRotating,
} from "@/lib/gemini-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiAccount();
    const keys = getGeminiKeys();
    const model = getGeminiModel();
    const out: Record<string, unknown> = {
      ok: true,
      configuredModel: process.env.GEMINI_MODEL?.trim() || null,
      modelInUse: model,
      defaultModel: DEFAULT_GEMINI_MODEL,
      keyCount: keys.length,
      keyPrefixes: keys.map((k) => `${k.slice(0, 6)}…`),
    };

    // そのキーで使えるモデル一覧 (generateContent 対応のものだけ)
    if (keys.length > 0) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(keys[0])}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          models?: { name?: string; supportedGenerationMethods?: string[] }[];
          error?: { message?: string };
        };
        if (!res.ok) {
          out.availableModelsError = data?.error?.message ?? `HTTP ${res.status}`;
        } else {
          const usable = (data.models ?? [])
            .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
            .map((m) => (m.name ?? "").replace(/^models\//, ""))
            .sort();
          out.availableModels = usable;
          out.modelInUseIsAvailable = usable.includes(model);
        }
      } catch (e) {
        out.availableModelsError = e instanceof Error ? e.message : "error";
      }
    }

    // 実際に 1 回呼んでみる (無料枠の軽い呼び出し)
    try {
      const r = await generateContentRotating({
        model,
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        config: { temperature: 0 },
      });
      out.testCall = { ok: true, text: (r.text ?? "").slice(0, 40) };
    } catch (e) {
      out.testCall = { ok: false, error: e instanceof Error ? e.message : "error" };
    }

    return Response.json(out);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
