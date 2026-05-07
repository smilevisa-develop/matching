import { AuthError, requireApiAccount } from "@/lib/auth";
import { extractJobPostingFromText } from "@/lib/ai-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) {
      return Response.json({ ok: false, error: "text を指定してください" }, { status: 400 });
    }
    const extracted = await extractJobPostingFromText(text);
    const populated = Object.entries(extracted).filter(
      ([, v]) => typeof v === "string" && v.trim() !== ""
    );
    return Response.json({ ok: true, extracted, populatedCount: populated.length });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
