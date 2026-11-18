/**
 * 共有の推薦リストを、暗証番号を知っている人が直す (2026-11-18 土田さん)。
 *   { pass } だけ → 暗証番号の確認
 *   { pass, id, key, value } → その候補者のそのセルを保存
 * 面接可能な時間帯・備考はカンバンの ✎ と同じ欄に書く。名前・住所などは候補者の情報 (システム) に書く。
 * 計算で出す列 (年齢・追加日付・特定技能通算期間・パートナー) だけは listOverrides に入れて、このリストの表示だけ変える。
 * 編集できる状態はブラウザの画面の中だけ (ページを閉じれば終わり)。
 */

import { prisma } from "@/lib/prisma";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import { normalizeToIsoDate } from "@/lib/date-normalize";

/** 列 → 候補者の情報のどこに書くか (2026-11-18 土田さん: リストで直したらシステムにも反映)。計算で出す列 (年齢・追加日付・通算期間など) はリストだけ */
const PERSON_FIELDS: Record<string, "name" | "nationality" | "residenceStatus" | "email"> = { name: "name", nationality: "nationality", residenceStatus: "residenceStatus", email: "email" };
const ONBOARDING_FIELDS: Record<string, "englishName" | "address" | "birthDate" | "phoneNumber"> = { englishName: "englishName", address: "address", birthDate: "birthDate", phoneNumber: "phoneNumber" };
const RESUME_FIELDS: Record<string, "gender" | "visaExpiryDate" | "retirementReason" | "traineeExperience" | "japaneseLevel" | "japaneseLevelDate" | "licenseName" | "preferenceNote"> = {
  gender: "gender", visaExpiryDate: "visaExpiryDate", retirementReason: "retirementReason", traineeExperience: "traineeExperience",
  japaneseLevel: "japaneseLevel", japaneseLevelDate: "japaneseLevelDate", licenseName: "licenseName", preferenceNote: "preferenceNote",
};
const DATE_KEYS = new Set(["birthDate", "visaExpiryDate", "japaneseLevelDate"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS = () => process.env.LIST_EDIT_PASSCODE?.trim() || "thuy";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { pass?: string; id?: number; key?: string; value?: string };
  if (!token || token.length < 16) return Response.json({ ok: false, error: "見つかりません" }, { status: 404 });
  if ((body.pass ?? "").trim().toLowerCase() !== PASS().toLowerCase()) {
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ ok: false, error: "暗証番号が違います" }, { status: 403 });
  }
  const deal = await prisma.deal.findUnique({ where: { shareToken: token }, select: { id: true } });
  if (!deal) return Response.json({ ok: false, error: "見つかりません" }, { status: 404 });
  if (body.id === undefined) return Response.json({ ok: true });

  const dc = await prisma.dealCandidate.findFirst({ where: { id: Number(body.id), dealId: deal.id }, select: { id: true, personId: true, listOverrides: true } });
  if (!dc) return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
  const key = String(body.key ?? "");
  const value = String(body.value ?? "").trim().slice(0, 2000);

  if (key === "interviewTime" || key === "note") {
    await prisma.dealCandidate.update({
      where: { id: dc.id },
      data: key === "interviewTime" ? { interviewTime: value || null } : { companyNote: value || null },
    });
    return Response.json({ ok: true });
  }
  const settings = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { recommendationColumns: true } });
  if (!sanitizeRecommendationColumns(settings?.recommendationColumns).includes(key as never)) {
    return Response.json({ ok: false, error: "この列は直せません" }, { status: 400 });
  }
  // 候補者の情報に書ける列は、システムにも書く (リスト側の上書きは消す = 以後はシステムの値を表示)
  const v = DATE_KEYS.has(key) && value ? normalizeToIsoDate(value) ?? value : value;
  let wrote = true;
  if (PERSON_FIELDS[key]) {
    const f = PERSON_FIELDS[key];
    if (f !== "email" && !v) return Response.json({ ok: false, error: "空にはできません" }, { status: 400 });
    await prisma.person.update({ where: { id: dc.personId }, data: { [f]: f === "email" ? v || null : v } });
  } else if (ONBOARDING_FIELDS[key]) {
    const f = ONBOARDING_FIELDS[key];
    await prisma.personOnboarding.upsert({ where: { personId: dc.personId }, update: { [f]: v || null }, create: { personId: dc.personId, [f]: v || null } });
  } else if (RESUME_FIELDS[key]) {
    const f = RESUME_FIELDS[key];
    await prisma.resumeProfile.upsert({ where: { personId: dc.personId }, update: { [f]: v || null }, create: { personId: dc.personId, [f]: v || null } });
  } else {
    wrote = false;
  }
  const current = (dc.listOverrides && typeof dc.listOverrides === "object" ? dc.listOverrides : {}) as Record<string, string>;
  const next = { ...current };
  // null = 元の値に戻す
  if (wrote || body.value === null || body.value === undefined) delete next[key];
  else next[key] = value;
  await prisma.dealCandidate.update({ where: { id: dc.id }, data: { listOverrides: next } });
  return Response.json({ ok: true, synced: wrote, value: wrote ? (key === "traineeExperience" ? v : v) : value });
}
