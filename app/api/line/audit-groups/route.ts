/**
 * LINE グループの在席状態を「読み取り専用 API」で監査する。
 *
 * ⚠️ メッセージは 1 通も送らない (グループメンバーには何も表示・通知されない)
 *
 * 使い方 (Railway 本番環境のトークンで実行):
 *   GET  /api/line/audit-groups          # 確認のみ (DB は更新しない、JSON で結果返す)
 *   POST /api/line/audit-groups          # 退会検知したものを isActive=false に更新
 *
 * 仕組み:
 *   isActive=true の全 LineGroup について GET /v2/bot/group/{groupId}/summary を呼ぶ
 *   - 200 OK         → Bot はまだ在席している
 *   - 404 Not Found  → Bot は退会済 (今は在席していない)
 *   - 401 / 403      → トークン問題 (全件で出るならトークンが違う)
 *   - その他のエラー → 一時的な問題、保留 (報告のみ、DB 更新しない)
 */
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

type CheckResult = {
  groupId: string;
  groupName: string | null;
  partnerName: string | null;
  status: "still-in" | "kicked-out" | "auth-error" | "error";
  detail?: string;
};

async function checkGroup(groupId: string, token: string): Promise<{ status: CheckResult["status"]; detail?: string }> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { status: "still-in" };
    if (res.status === 404) return { status: "kicked-out" };
    if (res.status === 401 || res.status === 403) {
      return { status: "auth-error", detail: `HTTP ${res.status}` };
    }
    const body = await res.text().catch(() => "");
    return { status: "error", detail: `HTTP ${res.status}: ${body.slice(0, 100)}` };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function runAudit(apply: boolean) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return Response.json({ ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" }, { status: 500 });
  }

  const groups = await prisma.lineGroup.findMany({
    where: { isActive: true },
    include: { partner: { select: { name: true } } },
    orderBy: { lastSeenAt: "asc" },
  });

  const results: CheckResult[] = [];
  for (const g of groups) {
    const r = await checkGroup(g.groupId, token);
    results.push({
      groupId: g.groupId,
      groupName: g.groupName,
      partnerName: g.partner?.name ?? null,
      status: r.status,
      detail: r.detail,
    });
    // レート制限避け (LINE 60 req/sec、控えめに 200ms 間隔)
    await new Promise((r) => setTimeout(r, 200));
  }

  const stillIn = results.filter((r) => r.status === "still-in");
  const kicked = results.filter((r) => r.status === "kicked-out");
  const authError = results.filter((r) => r.status === "auth-error");
  const errored = results.filter((r) => r.status === "error");

  // auth-error が多いなら、トークンが違う可能性 → DB 更新しない (安全装置)
  let updatedCount = 0;
  let safetyAbort = false;
  if (apply) {
    if (groups.length > 0 && authError.length / groups.length > 0.3) {
      safetyAbort = true;
    } else if (groups.length > 0 && kicked.length / groups.length > 0.8) {
      // 80% 以上が「退会」判定の場合も安全装置 (トークンミスマッチの可能性)
      safetyAbort = true;
    } else if (kicked.length > 0) {
      const res = await prisma.lineGroup.updateMany({
        where: { groupId: { in: kicked.map((k) => k.groupId) } },
        data: { isActive: false },
      });
      updatedCount = res.count;
    }
  }

  return Response.json({
    ok: true,
    summary: {
      total: groups.length,
      stillIn: stillIn.length,
      kicked: kicked.length,
      authError: authError.length,
      error: errored.length,
    },
    safetyAbort,
    safetyMessage: safetyAbort
      ? "安全装置: 過半数が認証エラー or 80% 以上が退会判定。トークンミスマッチの疑いがあるため DB 更新を中止しました。"
      : null,
    updatedCount,
    kicked: kicked.map(({ groupId, groupName, partnerName }) => ({ groupId, groupName, partnerName })),
    authError: authError.map(({ groupId, groupName, partnerName, detail }) => ({
      groupId,
      groupName,
      partnerName,
      detail,
    })),
    errored: errored.map(({ groupId, groupName, partnerName, detail }) => ({
      groupId,
      groupName,
      partnerName,
      detail,
    })),
  });
}

export async function GET() {
  try {
    await requireApiAccount();
    return runAudit(false);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function POST() {
  try {
    await requireApiAccount();
    return runAudit(true);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
