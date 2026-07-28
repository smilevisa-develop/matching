import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { randomBytes } from "node:crypto";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

type CustomQuestion = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "textarea" | "file";
};

/**
 * POST: 候補者の intake トークンを発行/更新。
 *   body: { excludedKeys?: string[], customQuestions?: CustomQuestion[] }
 *   ?regenerate=1 でトークン再発行
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const url = new URL(req.url);
    const regenerate = url.searchParams.get("regenerate") === "1";

    // body は空でも OK
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const excludedKeys = Array.isArray(body.excludedKeys)
      ? (body.excludedKeys as unknown[])
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0)
      : [];
    const customQuestions: CustomQuestion[] = Array.isArray(body.customQuestions)
      ? (body.customQuestions as Record<string, unknown>[]).flatMap((q) => {
          const label = typeof q?.label === "string" ? q.label.trim() : "";
          if (!label) return [];
          const key = typeof q?.key === "string" && q.key ? String(q.key) : `c_${Math.random().toString(36).slice(2, 10)}`;
          const required = q?.required === true;
          const type =
            q?.type === "textarea" ? "textarea" : q?.type === "file" ? "file" : "text";
          return [{ key, label, required, type } as CustomQuestion];
        })
      : [];

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, intakeToken: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    // 日本語簡易調査を含めるか (未指定は既定で ON)
    const japaneseCheckEnabled = body.japaneseCheckEnabled !== false;

    let token = person.intakeToken;
    if (!token || regenerate) token = generateToken();
    await prisma.person.update({
      where: { id: personId },
      data: {
        intakeToken: token,
        intakeConfig: { excludedKeys, customQuestions, japaneseCheckEnabled },
      },
    });
    return Response.json({ ok: true, token, path: `/intake/${token}` });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

/** GET: 現在の発行状態 (URL + 除外キー + カスタム質問) を返す */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await ctx.params;
    const personId = Number(id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "personId が不正です" }, { status: 400 });
    }
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { intakeToken: true, intakeConfig: true },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }
    const config =
      person.intakeConfig && typeof person.intakeConfig === "object"
        ? (person.intakeConfig as Record<string, unknown>)
        : {};
    return Response.json({
      ok: true,
      token: person.intakeToken,
      path: person.intakeToken ? `/intake/${person.intakeToken}` : null,
      excludedKeys: Array.isArray(config.excludedKeys) ? config.excludedKeys : [],
      customQuestions: Array.isArray(config.customQuestions) ? config.customQuestions : [],
      japaneseCheckEnabled: config.japaneseCheckEnabled !== false,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
