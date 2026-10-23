import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { isOfferedStage, onDealCandidateStageChanged, removeUntouchedOnboardingCard } from "@/lib/onboarding-autolink";
import { after } from "next/server";
import {
  readStageDates,
  stageCounterDeltas,
  todayJst,
  type CounterField,
} from "@/lib/deal-stages";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { removeUntouchedOfferRow, writeStageDateToSheet } from "@/lib/candidate-date-sheet";
import { requestKpiSheetSync } from "@/lib/kpi-sheet-sync";
import { moveDealCandidateStage } from "@/lib/deal-candidate-move";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const body = await req.json();
    const stage = String(body.stage ?? "").trim();
    const note = body.note === undefined ? undefined : String(body.note ?? "").trim() || null;
    // ステージに入れた日付 (カンバンで入力)。無ければ今日 (日本時間)
    const dateInput = body.date === undefined || body.date === null ? "" : String(body.date).trim();
    if (dateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return Response.json({ ok: false, error: "日付は YYYY-MM-DD で指定してください" }, { status: 400 });
    }
    const date = dateInput || todayJst();

    if (!stage) {
      return Response.json({ ok: false, error: "候補者ステップを指定してください" }, { status: 400 });
    }

    // ステージの移動に合わせて人数カウンターも動かす (lib/deal-candidate-move.ts)
    const { candidate, counters, stageChanged, agency, fromStage } = await moveDealCandidateStage(Number(id), stage, date, note);

    // 内定済み・内定承諾から内定より前に戻した (間違えて動かした) ときは、自動で作ったカードと行を片付ける
    if (isOfferedStage(fromStage) && !isOfferedStage(stage)) {
      after(() => cleanUpMistakenOffer(candidate.personId));
    }

    // 内定済み / 内定承諾 になったら内定者管理ボードにカードを用意する (応答は待たせない)。
    // 人材紹介会社 (WILLOF・ADECCO など) の候補者は内定者管理に出さない
    if (!agency) after(async () => {
      try {
        await onDealCandidateStageChanged(candidate.personId, stage, date);
      } catch (e) {
        console.warn("内定者ボードの自動作成に失敗:", e instanceof Error ? e.message : e);
      }
    });

    // 入力した日付を企業データベース (請求管理 / 内定者管理) に反映する (応答は待たせない)。
    // 途中を飛ばして進めた場合 (接続済み → 内定承諾 など) は、飛ばした段階の日付も一緒に書く
    if (stageChanged) {
      const written = Object.entries(readStageDates(candidate.stageDates)).filter(([, d]) => d === date);
      after(async () => {
        for (const [s, d] of written) {
          try {
            // 移した先の日付は上書きする。飛ばした段階は、手入力の日付が既にあればそちらを残す
            const r = await writeStageDateToSheet({ personId: candidate.personId, stage: s, date: d, onlyIfEmpty: s !== stage });
            if (!r.ok) console.info(`ステージ日付のスプシ反映をスキップ (${s}):`, r.skipped);
          } catch (e) {
            console.warn(`ステージ日付のスプシ反映に失敗 (${s}):`, e instanceof Error ? e.message : e);
          }
        }
      });
    }

    // 数字が変わったら企業データベース(スプシ)へも反映する (応答は待たせない)
    after(() => requestCompanyDatabaseSync());
    // 人材紹介KPI シート (自動転記タブ) の今月の数字も更新する
    if (stageChanged) after(() => requestKpiSheetSync());

    return Response.json({ ok: true, candidate, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

/**
 * カンバンから候補者を外す (間違えて入れたとき)。候補者本体は残る。
 * このカードで数えた人数カウンター (推薦・面接・内定など) も、接続済みまで戻したのと同じだけ戻す。
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const removedLink = await prisma.dealCandidate.findUniqueOrThrow({
      where: { id: Number(id) },
      select: { stage: true, personId: true },
    });
    const counters = await prisma.$transaction(async (tx) => {
      const link = await tx.dealCandidate.findUniqueOrThrow({
        where: { id: Number(id) },
        select: { stage: true, dealId: true },
      });
      const select = {
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        declineCount: true,
        rejectCount: true,
      };
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: link.dealId }, select });
      const deltas = Object.entries(stageCounterDeltas(link.stage, "接続済み")).filter(([, n]) => n !== 0) as [
        CounterField,
        number,
      ][];
      await tx.dealCandidate.delete({ where: { id: Number(id) } });
      if (deltas.length === 0) return deal;
      return tx.deal.update({
        where: { id: link.dealId },
        data: Object.fromEntries(deltas.map(([f, n]) => [f, Math.max(0, deal[f] + n)])),
        select,
      });
    });
    after(() => requestCompanyDatabaseSync());
    // 内定承諾などで自動で作ったカード・企業データベースの行も片付ける (間違えて入れた人のため)
    if (isOfferedStage(removedLink.stage)) after(() => cleanUpMistakenOffer(removedLink.personId));
    return Response.json({ ok: true, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

/** 間違えて内定にした候補者の後片付け: 内定者管理のカードと、企業データベース「内定者管理」の行 (手を付けていなければ) */
async function cleanUpMistakenOffer(personId: number) {
  try {
    const card = await removeUntouchedOnboardingCard(personId);
    if (!card.removed) {
      console.info(`内定者カードは残す (${personId}):`, card.reason);
      return;
    }
    const row = await removeUntouchedOfferRow(personId);
    if (!row.removed) console.info(`内定者管理の行は残す (${personId}):`, row.reason);
  } catch (e) {
    console.warn("内定の後片付けに失敗:", e instanceof Error ? e.message : e);
  }
}
