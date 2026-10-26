/**
 * 請求の流れ (2026/10 採用チームの運用):
 *
 *   入社日が確定 → 翌月 1 日に企業へ請求 → その月末に入金
 *   → 入金を確認したら、パートナーに請求書の作成を依頼 → パートナーの請求書を受け取る → 次の月末までに支払い
 *
 * 例: 10/15 入社 → 11/1 請求 → 11/30 入金 → 12 月初めにパートナーへ依頼 → 12/31 までに支払い
 *
 * 内定者管理の「請求」の列に入れたときに、入社日からこの 5 つのタスクを期限つきで作る (紹介パートナーがいなければ前の 2 つだけ)。
 * 担当は 2 つに分ける:
 *   経理担当 … 請求書の送付・入金確認・パートナーへの支払い (請求管理ページで選ぶ。未設定なら管理者)
 *   採用担当 … パートナーへの請求書の依頼・受け取り (その求人の担当者)
 */

import { prisma } from "@/lib/prisma";

export const BILLING_PHASE = "11. 請求";
export const BILLING_STAGE = "billing";

export type BillingRole = "accounting" | "recruiter";
export type BillingStepKey = "invoice" | "payment" | "pa-request" | "pa-invoice" | "pa-payment";

export const BILLING_ROLE_LABELS: Record<BillingRole, string> = { accounting: "経理担当", recruiter: "採用担当" };

/** 段階の名前 (請求管理ページの見出し) */
export const BILLING_STEPS: { key: BillingStepKey; label: string; role: BillingRole; partnerOnly: boolean }[] = [
  { key: "invoice", label: "企業へ請求書を送る", role: "accounting", partnerOnly: false },
  { key: "payment", label: "企業からの入金を確認する", role: "accounting", partnerOnly: false },
  { key: "pa-request", label: "パートナーに請求書の作成を依頼する", role: "recruiter", partnerOnly: true },
  { key: "pa-invoice", label: "パートナーの請求書を受け取る", role: "recruiter", partnerOnly: true },
  { key: "pa-payment", label: "パートナーへ支払う", role: "accounting", partnerOnly: true },
];

/** 日本時間の日付 → その日 0 時 (JST) */
const jst = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 9 * 3600_000);
/** 月末の日 (m は 1〜12) */
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addMonth = (y: number, m: number, n: number) => {
  const t = y * 12 + (m - 1) + n;
  return [Math.floor(t / 12), (t % 12) + 1] as const;
};

/** 入社日 (YYYY-MM-DD) から、各段階の期限 */
export function billingSchedule(joinYmd: string) {
  const [jy, jm] = joinYmd.split("-").map(Number);
  const [iy, im] = addMonth(jy, jm, 1); // 請求する月 (入社の翌月)
  const [py, pm] = addMonth(iy, im, 1); // パートナーへ支払う月 (入金の翌月)
  return {
    joinMonth: jm,
    invoice: { date: jst(iy, im, 1), label: `${im}/1` },
    payment: { date: jst(iy, im, lastDay(iy, im)), label: `${im}/${lastDay(iy, im)}` },
    paRequest: { date: jst(py, pm, 7), label: `${pm}/7` },
    paInvoice: { date: jst(py, pm, 20), label: `${pm}/20` },
    paPayment: { date: jst(py, pm, lastDay(py, pm)), label: `${pm}/${lastDay(py, pm)}` },
  };
}

/** 入社日・パートナー名から、請求の 5 つ (パートナーがいなければ 2 つ) のタスクを組み立てる */
export function buildBillingTasks(args: {
  joinYmd: string;
  partnerName: string | null;
  accountingOwner: string | null;
  recruiterOwner: string | null;
}) {
  const s = billingSchedule(args.joinYmd);
  const tasks: { billingStep: BillingStepKey; title: string; dueAt: Date; owner: string | null; note: string }[] = [
    {
      billingStep: "invoice",
      title: `【${s.invoice.label}】企業へ請求書を送る（${s.joinMonth}月入社分）`,
      dueAt: s.invoice.date,
      owner: args.accountingOwner,
      note: "入社の翌月 1 日に送る。送ったら企業データベースの請求管理に請求日・入金期日・「発行済」が入ります",
    },
    {
      billingStep: "payment",
      title: `【${s.payment.label}まで】企業からの入金を確認する`,
      dueAt: s.payment.date,
      owner: args.accountingOwner,
      note: "請求した月の月末が入金期日。確認したら請求管理の請求ステータスが「入金済」になります",
    },
  ];
  if (args.partnerName) {
    tasks.push(
      {
        billingStep: "pa-request",
        title: `【${s.paRequest.label}まで】入金を確認したら、パートナー（${args.partnerName}）に請求書の作成を依頼する`,
        dueAt: s.paRequest.date,
        owner: args.recruiterOwner,
        note: "企業からの入金を確認してから依頼する",
      },
      {
        billingStep: "pa-invoice",
        title: `【${s.paInvoice.label}まで】パートナーの請求書を受け取る`,
        dueAt: s.paInvoice.date,
        owner: args.recruiterOwner,
        note: "受け取ったら請求管理の「PAからの請求書」が「受領済」になります",
      },
      {
        billingStep: "pa-payment",
        title: `【${s.paPayment.label}まで】パートナーへ支払う`,
        dueAt: s.paPayment.date,
        owner: args.accountingOwner,
        note: "入金の翌月末までに支払う。支払ったら請求管理の支払い有無が「支払済」、支払日が入ります",
      },
    );
  }
  return tasks;
}

/** 経理担当の名前 (請求管理ページで選んだ人。未設定なら管理者) */
export async function accountingOwnerName(): Promise<string | null> {
  const settings = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { billingOwnerId: true } });
  const owner = settings?.billingOwnerId
    ? await prisma.staffAccount.findUnique({ where: { id: settings.billingOwnerId }, select: { name: true } })
    : await prisma.staffAccount.findFirst({ where: { role: "admin" }, orderBy: { id: "asc" }, select: { name: true } });
  return owner?.name ?? null;
}

const ymdJst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 内定者カードに請求のタスクを用意する (請求の列に入れたとき・入社日を変えたとき)。
 * まだ終わっていない請求のタスクは作り直し、終わったものは残す。入社日が無ければ何もしない。
 */
export async function ensureBillingTasks(placementId: number): Promise<{ created: number; reason?: string }> {
  const p = await prisma.personPlacement.findUnique({
    where: { id: placementId },
    select: {
      joinAt: true,
      personId: true,
      followUpOwner: { select: { name: true } },
      person: {
        select: {
          partner: { select: { name: true } },
          dealCandidates: { orderBy: { updatedAt: "desc" }, take: 1, select: { deal: { select: { owner: { select: { name: true } } } } } },
        },
      },
      tasks: { select: { id: true, category: true, billingStep: true, doneAt: true } },
    },
  });
  if (!p) return { created: 0, reason: "内定者が見つかりません" };
  if (!p.joinAt) return { created: 0, reason: "入社日がありません" };
  const personId = p.personId;

  const done = new Set(p.tasks.filter((t) => t.doneAt && t.billingStep).map((t) => t.billingStep));
  // 終わっていない請求のタスク (以前の「請求対応を実施する」も含む) を消して作り直す
  await prisma.placementTask.deleteMany({
    where: { placementId, doneAt: null, OR: [{ category: BILLING_PHASE }, { billingStep: { not: null } }] },
  });
  const tasks = buildBillingTasks({
    joinYmd: ymdJst(p.joinAt),
    partnerName: p.person?.partner?.name ?? null,
    accountingOwner: await accountingOwnerName(),
    recruiterOwner: p.person?.dealCandidates[0]?.deal.owner?.name ?? p.followUpOwner?.name ?? null,
  }).filter((t) => !done.has(t.billingStep));
  // 企業データベースの請求管理で終わっている段階 (発行済・入金済・支払済など) は、最初から完了にする
  let sheetDone = new Set<BillingStepKey>();
  if (personId) {
    try {
      const { readBillingDoneSteps } = await import("@/lib/billing-sheet");
      sheetDone = await readBillingDoneSteps(personId);
    } catch (e) {
      console.warn("請求管理の読み取りに失敗:", e instanceof Error ? e.message : e);
    }
  }
  const max = await prisma.placementTask.aggregate({ where: { placementId }, _max: { sortOrder: true } });
  let order = (max._max.sortOrder ?? 0) + 1;
  if (tasks.length > 0) {
    const now = new Date();
    await prisma.placementTask.createMany({
      data: tasks.map((t) => ({
        placementId,
        category: BILLING_PHASE,
        sortOrder: order++,
        ...t,
        ...(sheetDone.has(t.billingStep) ? { doneAt: now, doneBy: "請求管理シート" } : {}),
      })),
    });
  }
  return { created: tasks.length };
}
