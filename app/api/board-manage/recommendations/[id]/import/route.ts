/**
 * 案件ボードの管理: パートナーの推薦を候補者に取り込み、その案件の候補者 (接続済み) にする (要ログイン)。
 *
 * POST {}                       → 同じ名前の候補者がいれば作らずに { ok: false, duplicates } を返す
 * POST { personId }             → その候補者 (既にいる人) を案件に紐づける
 * POST { createNew: true }      → 同じ名前の人がいても、新しい候補者として作る
 *
 * 取り込んだら推薦の状況を「書類確認中」にする (まだ「受付」のときだけ)。パートナーの画面にもそう出る。
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { todayJst } from "@/lib/deal-stages";
import { findDuplicatePersons } from "@/lib/duplicate-person";
import { buildPersonFolderName, ensurePersonDriveFolder } from "@/lib/google-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIRST_STAGE = "接続済み";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireApiAccount();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const rec = await prisma.boardRecommendation.findUnique({
      where: { id: Number(id) },
      include: { partner: { select: { name: true } } },
    });
    if (!rec) return Response.json({ ok: false, error: "推薦が見つかりません" }, { status: 404 });
    if (rec.personId) {
      return Response.json({ ok: false, error: `取り込み済みです (候補者 #${rec.personId})` }, { status: 409 });
    }

    let personId: number | null = Number.isInteger(Number(body?.personId)) && Number(body?.personId) > 0 ? Number(body.personId) : null;
    let created = false;

    if (personId) {
      const exists = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
      if (!exists) return Response.json({ ok: false, error: `候補者 #${personId} が見つかりません` }, { status: 404 });
    } else {
      if (body?.createNew !== true) {
        const [hits] = await findDuplicatePersons([{ name: rec.candidateName, englishName: rec.candidateName }]);
        if (hits.length) {
          return Response.json({ ok: false, duplicates: hits.slice(0, 5) }, { status: 409 });
        }
      }
      const person = await prisma.person.create({
        data: {
          name: rec.candidateName,
          nationality: rec.nationality || "不明",
          residenceStatus: rec.residenceStatus || "不明",
          partnerId: rec.partnerId,
          channel: "未設定",
          registeredBy: null,
        },
        select: { id: true, name: true },
      });
      personId = person.id;
      created = true;
      // Drive の候補者フォルダは応答を待たせずに作る (失敗しても候補者の保存時に作り直される)
      const newId = person.id;
      after(async () => {
        try {
          const folder = await ensurePersonDriveFolder({
            existingFolderUrl: null,
            personId: newId,
            personName: buildPersonFolderName({ id: newId, name: person.name }),
          });
          if (folder.folderUrl) await prisma.person.update({ where: { id: newId }, data: { driveFolderUrl: folder.folderUrl } });
        } catch (e) {
          console.warn(`[board import] Drive フォルダの作成に失敗 id=${newId}:`, e instanceof Error ? e.message : e);
        }
      });
    }

    // 案件の候補者にする (既に入っていれば、そのまま)
    const note = [
      `案件ボード経由 (推薦 #${rec.id} ・ ${rec.partner.name})`,
      [rec.age ? `${rec.age}歳` : "", rec.gender ?? "", rec.residence ?? "", rec.japaneseLevel ? `日本語 ${rec.japaneseLevel}` : "", rec.experience ?? ""]
        .filter(Boolean)
        .join(" ・ "),
      rec.resumeUrl ? `履歴書: ${rec.resumeUrl}` : "",
      rec.note ?? "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);

    const existingCandidate = await prisma.dealCandidate.findUnique({
      where: { dealId_personId: { dealId: rec.dealId, personId } },
      select: { id: true },
    });
    if (!existingCandidate) {
      await prisma.dealCandidate.create({
        data: { dealId: rec.dealId, personId, stage: FIRST_STAGE, stageDates: { [FIRST_STAGE]: todayJst() }, note },
      });
    }

    await prisma.boardRecommendation.update({
      where: { id: rec.id },
      data: { personId, ...(rec.status === "受付" ? { status: "書類確認中" } : {}) },
    });

    console.info(`[board import] 推薦 #${rec.id} → 候補者 #${personId} (${created ? "新規" : "既存"}) by ${account.name}`);
    return Response.json({ ok: true, personId, created });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
