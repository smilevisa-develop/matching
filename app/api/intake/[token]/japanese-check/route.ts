/**
 * 旧: 入力フォーム同梱版の日本語チェック受け口 (廃止)。
 *
 * 日本語チェックは専用リンク (/japanese-check/[token]) に分離し、受験を 1 回のみにした。
 * この経路を残すと回数制限を迂回できてしまうため、受け付けずに 410 を返す。
 * (入力フォームの画面にはもう録音欄が無いので、ここを呼ぶ画面は存在しない)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      ok: false,
      error:
        "日本語チェックは専用リンクから受験してください。担当者にリンクをお問い合わせください。",
    },
    { status: 410 },
  );
}
