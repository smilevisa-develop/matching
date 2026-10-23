import { AuthError, requireApiAccount } from "@/lib/auth";
import { findDuplicatePersons, type DuplicateQuery } from "@/lib/duplicate-person";

/**
 * 登録前の二重登録チェック。
 * POST { candidates: [{ name, englishName, birthDate }] } → { ok, duplicates: [[{ id, name, englishName, birthDate }], ...] }
 */
export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const list: DuplicateQuery[] = Array.isArray(body?.candidates) ? body.candidates.slice(0, 50) : [];
    const duplicates = await findDuplicatePersons(
      list.map((c) => ({
        name: typeof c?.name === "string" ? c.name : null,
        englishName: typeof c?.englishName === "string" ? c.englishName : null,
        birthDate: typeof c?.birthDate === "string" ? c.birthDate : null,
      })),
    );
    return Response.json({ ok: true, duplicates });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
