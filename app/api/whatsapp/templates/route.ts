import { AuthError, requireApiAccount } from "@/lib/auth";

const GRAPH_VERSION = "v22.0";

/**
 * Meta WhatsApp Business Account の「承認済み」メッセージテンプレ一覧を返す。
 * 連絡テンプレート画面で承認テンプレ名をドロップダウン選択させるために使う
 * (逐一テンプレ名を手入力しなくてよいように)。
 *
 * 必要な環境変数:
 *   WA_ACCESS_TOKEN … Cloud API アクセストークン
 *   WA_WABA_ID      … WhatsApp Business Account ID (テンプレはこの WABA 単位)
 *   WA_TEMPLATE_ALLOWLIST … (任意) このアプリで使うテンプレ名の許可リスト (CSV/空白区切り)。
 *     指定すると一覧をこれだけに絞る。末尾 "*" で前方一致 (例: "partner_*")。
 *     未指定なら WABA の承認済みテンプレを全て返す。
 */
export async function GET() {
  try {
    await requireApiAccount();
    const token = process.env.WA_ACCESS_TOKEN;
    const wabaId = process.env.WA_WABA_ID;
    const allow = (process.env.WA_TEMPLATE_ALLOWLIST ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const isAllowed = (n: string) =>
      allow.length === 0 ||
      allow.some((a) => (a.endsWith("*") ? n.startsWith(a.slice(0, -1)) : n === a));
    if (!token || !wabaId) {
      return Response.json({
        ok: true,
        configured: false,
        templates: [],
        note: "WA_ACCESS_TOKEN / WA_WABA_ID が未設定です",
      });
    }
    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}` +
      `/message_templates?fields=name,language,status,category,components&limit=200` +
      `&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          configured: true,
          templates: [],
          error: data?.error?.message ?? "テンプレ一覧の取得に失敗しました",
        },
        { status: 502 }
      );
    }
    type MetaComponent = {
      type?: string;
      text?: string;
      example?: { body_text?: string[][] };
    };
    type MetaTemplate = {
      name: string;
      language: string;
      status: string;
      category?: string;
      components?: MetaComponent[];
    };
    const templates = ((data.data ?? []) as MetaTemplate[])
      .filter((t) => t.status === "APPROVED" && isAllowed(t.name))
      .map((t) => {
        const body = (t.components ?? []).find((c) => c.type === "BODY");
        const nums = [...(body?.text ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
          Number(m[1])
        );
        return {
          name: t.name,
          language: t.language,
          category: t.category ?? null,
          // 本文の {{1}}..{{n}} の最大番号 = 本文パラメータ数
          bodyVarCount: nums.length ? Math.max(...nums) : 0,
          // 本文テキスト ({{1}}..{{n}} 込み) — プレビュー描画・ラベル導出に使う
          bodyText: body?.text ?? "",
          // 申請時のサンプル値 ({{1}}..{{n}} の順) — 入力ヒント表示に使う
          examples: Array.isArray(body?.example?.body_text?.[0])
            ? (body!.example!.body_text![0] as string[])
            : [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ ok: true, configured: true, templates });
  } catch (e) {
    return Response.json(
      { ok: false, templates: [], error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
