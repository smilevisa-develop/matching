/**
 * 新規パートナーの自己記入フォーム (認証不要。リンクのトークンで判定)。
 *   POST /api/partner-intake/{token}  … 入力内容でパートナーを登録する
 *
 * 登録されたパートナーは「パートナーリスト」にそのまま出る (アクティブ)。
 * 評価・メモは社内 (CR 担当) が後から入れる。
 */

import { prisma } from "@/lib/prisma";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
  PARTNER_ROLES,
  toCsv,
} from "@/lib/partner-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QR_MAX_BYTES = 5 * 1024 * 1024;
const QR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** LINE QR の画像 (dataURL) を保存して配信 URL を返す。画像でない / 大きすぎるときは null */
async function saveQrImage(dataUrl: unknown): Promise<string | null> {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!m || !QR_MIME.has(m[1])) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > QR_MAX_BYTES) return null;
  const saved = await prisma.uploadedFile.create({
    data: { filename: "line-qr", mimeType: m[1], sizeBytes: buf.length, data: buf, expiresAt: null },
    select: { id: true },
  });
  return `/api/files/${saved.id}`;
}

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t === "" ? null : t;
};
const pick = (v: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const settings = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { partnerIntakeToken: true } });
    if (!token || token.length < 8 || !settings?.partnerIntakeToken || settings.partnerIntakeToken !== token) {
      return Response.json({ ok: false, error: "このリンクは無効です。担当者に新しいリンクをもらってください" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const name = str(body.name, 200);
    if (!name) return Response.json({ ok: false, error: "社名 / 団体名を入力してください" }, { status: 400 });
    const email = str(body.email, 200);
    const contactName = str(body.contactName, 200);
    if (!email && !str(body.lineContact) && typeof body.lineQrDataUrl !== "string") {
      return Response.json({ ok: false, error: "メールか LINE (ID または QR 画像) のどちらかを入力してください" }, { status: 400 });
    }

    const exists = await prisma.partner.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (exists) {
      return Response.json({ ok: false, error: "同じ名前のパートナーが既に登録されています。担当者にご連絡ください" }, { status: 409 });
    }

    const role = str(body.role);
    const scope = str(body.introducibleScope);
    const lineQrUrl = await saveQrImage(body.lineQrDataUrl);
    const partner = await prisma.partner.create({
      data: {
        name,
        contactName,
        role: role && (PARTNER_ROLES as readonly string[]).includes(role) ? role : null,
        country: str(body.country, 100),
        email,
        snsContact: str(body.lineContact, 500),
        lineQrUrl,
        introducibleScope: scope && (INTRODUCIBLE_SCOPES as readonly string[]).includes(scope) ? scope : null,
        introducibleNationalities: toCsv(pick(body.introducibleNationalities, INTRODUCIBLE_NATIONALITIES)),
        introducibleFields: toCsv(pick(body.introducibleFields, INTRODUCIBLE_FIELDS)),
        introducibleResidenceStatuses: toCsv(pick(body.introducibleResidenceStatuses, INTRODUCIBLE_RESIDENCE_STATUSES)),
        feeAmount: str(body.feeAmount, 200),
        minFeeAmount: str(body.minFeeAmount, 200),
        linkStatus: "未",
        relationshipStatus: "実績無し",
        notes: `自己記入フォームから登録 (${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })})`,
      },
      select: { id: true },
    });
    return Response.json({ ok: true, id: partner.id });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
