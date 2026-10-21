import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { onDealCandidateStageChanged } from "@/lib/onboarding-autolink";
import { after } from "next/server";
import {
  isAgencyKind,
  progressStagesForKind,
  readFilledStages,
  readStageDates,
  stageCounterDeltas,
  todayJst,
  type CounterField,
} from "@/lib/deal-stages";
import { requestCompanyDatabaseSync } from "@/lib/company-db-sync";
import { writeStageDateToSheet } from "@/lib/candidate-date-sheet";
import { requestKpiSheetSync } from "@/lib/kpi-sheet-sync";

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

    // ステージの移動に合わせて人数カウンターも動かす (カンバンと数字を常に揃えるため)。
    // 同時に動かされても二重に数えないよう、前のステージの読み取りから更新までを 1 つにまとめる。
    const { candidate, counters, stageChanged, agency } = await prisma.$transaction(async (tx) => {
      const before = await tx.dealCandidate.findUniqueOrThrow({
        where: { id: Number(id) },
        select: { stage: true, dealId: true, stageDates: true, deal: { select: { company: { select: { companyKind: true } } } } },
      });
      const kind = before.deal.company.companyKind;
      const progress = progressStagesForKind(kind);
      // ステージごとの日付を記録する (同じステージに留まるときは触らない)。
      // 途中を飛ばして進めたとき (事前面談済み → 内定済み など) は、飛ばした段階にも同じ日付を入れる
      // (人数カウンターと同じく「通過した」扱い。月別集計で漏れないようにする)
      const stageDates: Record<string, unknown> = readStageDates(before.stageDates);
      const filled = readFilledStages(before.stageDates);
      if (before.stage !== stage) {
        const from = progress.indexOf(before.stage);
        const to = progress.indexOf(stage);
        if (from >= 0 && to > from) {
          for (let i = from + 1; i < to; i++) {
            const skipped = progress[i];
            if (!stageDates[skipped]) {
              stageDates[skipped] = date;
              filled.add(skipped);
            }
          }
        }
        stageDates[stage] = date;
        filled.delete(stage);
      }
      // 自動で埋めた段階の印 (日数の計算から外すため)
      if (filled.size > 0) stageDates._filled = [...filled];
      const candidate = await tx.dealCandidate.update({
        where: { id: Number(id) },
        data: {
          stage,
          stageDates: stageDates as Prisma.InputJsonValue,
          ...(note !== undefined ? { note } : {}),
        },
      });
      const deltas = Object.entries(stageCounterDeltas(before.stage, stage)).filter(([, n]) => n !== 0) as [
        CounterField,
        number,
      ][];
      const select = {
        recommendedCount: true,
        interviewCount: true,
        offerCount: true,
        declineCount: true,
        rejectCount: true,
      };
      const current = await tx.deal.findUniqueOrThrow({ where: { id: before.dealId }, select });
      if (deltas.length === 0) return { candidate, counters: current, stageChanged: before.stage !== stage, agency: isAgencyKind(kind) };
      const counters = await tx.deal.update({
        where: { id: before.dealId },
        // 手で直した結果より多く戻されても 0 未満にはしない
        data: Object.fromEntries(deltas.map(([field, n]) => [field, Math.max(0, current[field] + n)])),
        select,
      });
      return { candidate, counters, stageChanged: before.stage !== stage, agency: isAgencyKind(kind) };
    });

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
    return Response.json({ ok: true, counters });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
