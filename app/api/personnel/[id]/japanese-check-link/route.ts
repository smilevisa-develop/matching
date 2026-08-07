/**
 * 日本語チェック専用リンクの発行 / 状態取得 (要ログイン)。
 *
 * GET  /api/personnel/[id]/japanese-check-link          現在の発行状態と実施状況
 * POST /api/personnel/[id]/japanese-check-link          未発行なら発行 (発行済みならそのまま返す)
 *      ?regenerate=1                                    トークンを作り直す (旧リンクは無効になる)
 *
 * 入力フォーム (intakeToken) とは別のトークンなので、片方だけ再発行できる。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/** 候補者の日本語チェックの実施状況をまとめる */
async function loadState(personId: number) {
  return prisma.person.findUnique({
    where: { id: personId },
    select: {
      japaneseCheckToken: true,
      japaneseCheck: {
        select: { assessedAt: true, estimatedLevel: true, updatedAt: true, recordings: true },
      },
    },
  });
}

function buildResponse(state: NonNullable<Awaited<ReturnType<typeof loadState>>>) {
  const jc = state.japaneseCheck;
  const recordingCount = Array.isArray(jc?.recordings) ? jc.recordings.length : 0;
  return {
    ok: true,
    token: state.japaneseCheckToken,
    path: state.japaneseCheckToken ? `/japanese-check/${state.japaneseCheckToken}` : null,
    // 実施状況 (候補者が録音を送ってきたか / AI 判定まで終わったか)
    recorded: recordingCount > 0,
    recordingCount,
    assessed: Boolean(jc?.assessedAt),
    estimatedLevel: jc?.estimatedLevel ?? null,
    submittedAt: jc?.updatedAt ? jc.updatedAt.toISOString() : null,
  };
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const state = await loadState(personId);
    if (!state) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }
    return Response.json(buildResponse(state));
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const regenerate = new URL(req.url).searchParams.get("regenerate") === "1";

    const current = await loadState(personId);
    if (!current) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    let token = current.japaneseCheckToken;
    if (!token || regenerate) {
      token = generateToken();
      await prisma.person.update({
        where: { id: personId },
        data: { japaneseCheckToken: token },
      });
    }

    const state = await loadState(personId);
    return Response.json(buildResponse(state!));
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
