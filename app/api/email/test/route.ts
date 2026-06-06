/**
 * メール送信 (Apps Script Web App) 動作検証エンドポイント
 *
 * 使い方:
 *   ブラウザで /api/email/test を開く
 *   - GET: 環境変数チェック + Apps Script への疎通確認 (送信せず)
 *   - GET ?to=xxx@example.com: 実際にテスト送信
 *
 * 検証項目:
 *   1. 環境変数が揃っているか
 *   2. Apps Script URL に到達できるか (HTTPS 200)
 *   3. (任意) 実際にテストメールが送信できるか
 */
import { requireApiAccount } from "@/lib/auth";
import { sendEmail, textToBasicHtml, DEFAULT_EMAIL_SUBJECT } from "@/lib/email";

export const dynamic = "force-dynamic";

type StepResult = { name: string; ok: boolean; detail: string };

function ok(name: string, detail: string): StepResult {
  return { name, ok: true, detail };
}
function fail(name: string, detail: string): StepResult {
  return { name, ok: false, detail };
}

export async function GET(req: Request) {
  try {
    await requireApiAccount();
  } catch {
    return Response.json({ ok: false, error: "ログインしてください" }, { status: 401 });
  }

  const url = new URL(req.url);
  const toAddress = url.searchParams.get("to");

  const steps: StepResult[] = [];

  // Step 1: 環境変数チェック
  const scriptUrl = process.env.APPS_SCRIPT_EMAIL_URL?.trim();
  const secret = process.env.APPS_SCRIPT_EMAIL_SECRET?.trim();
  const fromName = process.env.GMAIL_FROM?.trim();

  const envIssues: string[] = [];
  if (!scriptUrl) envIssues.push("APPS_SCRIPT_EMAIL_URL 未設定");
  if (!secret) envIssues.push("APPS_SCRIPT_EMAIL_SECRET 未設定");
  if (!fromName) envIssues.push("GMAIL_FROM 未設定 (任意だが推奨)");

  if (envIssues.filter((s) => !s.includes("任意")).length > 0) {
    steps.push(fail("環境変数チェック", envIssues.join(" / ")));
    return Response.json({
      ok: false,
      steps,
      summary: "環境変数が足りません。Apps Script のセットアップ後、Railway で設定してください。",
    });
  }
  steps.push(
    ok(
      "環境変数チェック",
      `APPS_SCRIPT_EMAIL_URL=${scriptUrl!.slice(0, 60)}..., GMAIL_FROM=${fromName ?? "(未設定)"}`
    )
  );

  // Step 2: 実際の送信テスト (?to=xxx が指定されてればそこに送信)
  if (toAddress) {
    const r = await sendEmail({
      to: toAddress,
      subject: `${DEFAULT_EMAIL_SUBJECT} (テスト送信)`,
      text:
        "これは SMILE MATCHING のテスト送信です。\n\n" +
        "このメールが届いていれば Apps Script 経由のメール送信が正常に動作しています。\n\n" +
        "（このメッセージはテスト送信のため自動配信されました）",
      html: textToBasicHtml(
        "これは SMILE MATCHING のテスト送信です。\n\n" +
          "このメールが届いていれば Apps Script 経由のメール送信が正常に動作しています。\n\n" +
          "（このメッセージはテスト送信のため自動配信されました）"
      ),
    });
    if (r.ok) {
      steps.push(ok("テスト送信", `${toAddress} へ送信成功 (id=${r.id ?? "?"})`));
      return Response.json({
        ok: true,
        steps,
        summary: `🎉 ${toAddress} へテストメールを送信しました。受信箱を確認してください。`,
      });
    } else {
      steps.push(fail("テスト送信", r.error));
      const hints: string[] = [];
      if (r.error.includes("HTTP 4") || r.error.includes("HTTP 5")) {
        hints.push("→ Apps Script Web App のデプロイ設定 (Execute as: Me, Access: Anyone) を確認してください。");
      }
      if (r.error.toLowerCase().includes("authoriz") || r.error.toLowerCase().includes("permission")) {
        hints.push("→ Apps Script の最初の実行で recruit@ が権限承認を完了している必要があります。");
      }
      if (r.error.toLowerCase().includes("secret") || r.error.toLowerCase().includes("unauthor")) {
        hints.push("→ Apps Script コード内の SECRET と Railway の APPS_SCRIPT_EMAIL_SECRET が一致しているか確認。");
      }
      return Response.json({ ok: false, steps, summary: "テスト送信失敗", hints });
    }
  }

  return Response.json({
    ok: true,
    steps,
    summary:
      "環境変数 OK。実際の送信テストをするには URL に ?to=your@example.com を付けてアクセスしてください。",
  });
}
