/**
 * Slack の請求スレッドで請求を完結させる (2026/11 土田さん)。
 * 川村さんは Slack だけ見ればよく、アプリ (/billing) は確認と修正に使う。
 *
 *   1. /billing の「Slack に投稿」で、川村さんへの請求書の発行依頼をチャンネルに投稿 (= その月の請求スレッド)
 *   2. スレッド (チャンネル) に PDF が貼られたら、だれの請求書かを読んで Drive に保存し、段階を済にする
 *      - 企業への請求書: ファイル名の「〇〇御中」やメッセージの企業名・請求ID から。同じ企業の何人分かは全員に入れる
 *      - パートナーの請求書: 請求ID・候補者名・パートナー名から。保存したら川村さんへの振込依頼をスレッドに出す
 *      - 分からないときは「請求ID を書いて送り直して」と返す (勝手に決めない)
 *   3. アプリの投稿のボタンで済にする (押すと「取り消す」に変わる。✅ のリアクションでも同じ)
 *      - 「企業への請求書を保存しました」の「入金を確認した」
 *      - 「振込のお願い」の「振り込んだ」
 */

import { prisma } from "@/lib/prisma";
import type { PersonBilling } from "@/generated/prisma/client";
import { billingPatchForStep, stepDoneFromBilling, writeBillingToSheet, type LedgerStepKey } from "@/lib/billing-ledger";
import { saveInvoicePdf, type InvoiceKind } from "@/lib/billing-invoice";
import { downloadSlackFile, slackConfig, slackPost, slackUpdate, textWithButton } from "@/lib/slack";
import { todayJst } from "@/lib/deal-stages";

const BY = "Slack";
const CHECKS = new Set(["white_check_mark", "heavy_check_mark", "ballot_box_with_check", "o", "ok"]);

type Cand = { personId: number; invoiceNo: string; name: string; company: string; partner: string; b: PersonBilling };

/** 社名などを比べやすくする (全角半角・会社の種類・空白・記号を消す) */
export function norm(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|一般社団法人|社会福祉法人|医療法人|\(株\)|\(有\)|御中|様/g, "")
    .replace(/[\s_\-・.,、。()（）「」【】\[\]]/g, "");
}

async function loadCandidates(): Promise<Cand[]> {
  const list = await prisma.personBilling.findMany({
    include: {
      person: {
        select: {
          name: true,
          onboarding: { select: { englishName: true } },
          partner: { select: { name: true } },
          placement: { select: { externalCompanyName: true, stage: true } },
          dealCandidates: { orderBy: { updatedAt: "desc" }, take: 1, select: { deal: { select: { company: { select: { name: true } } } } } },
        },
      },
    },
  });
  return list
    .filter((x) => !["card_cancelled", "declined"].includes(x.person.placement?.stage ?? ""))
    .map((x) => ({
      personId: x.personId,
      invoiceNo: x.invoiceNo ?? "",
      name: x.person.onboarding?.englishName?.trim() || x.person.name,
      company: x.person.dealCandidates[0]?.deal.company.name ?? x.person.placement?.externalCompanyName ?? "",
      partner: x.partnerName ?? x.person.partner?.name ?? "",
      b: x,
    }));
}

const done = (c: Cand, step: LedgerStepKey) => stepDoneFromBilling(step, c.b) === true;
const hasPartner = (c: Cand) => c.b.route !== "自社" && !!c.partner;
const recent = (ymd: string | null, days: number) => !!ymd && Date.now() - new Date(`${ymd}T00:00:00+09:00`).getTime() < days * 86400_000;

/** 貼られた PDF がだれの、どちらの請求書かを決める */
export function matchInvoice(cands: Cand[], fileName: string, text: string): { kind: InvoiceKind; people: Cand[] } | { error: string } {
  const base = fileName.replace(/\.pdf$/i, "");
  const all = `${text}\n${base}`;
  const nAll = norm(all);
  const addressee = base.includes("御中") ? norm(base.split("御中")[0]) : "";
  const companyHit = (c: Cand) => {
    const nc = norm(c.company);
    if (nc.length < 2) return false;
    if (addressee) return addressee.includes(nc) || nc.includes(addressee);
    return nAll.includes(nc);
  };

  // 1) 請求ID が書いてあればそれ
  const ids = [...all.normalize("NFKC").matchAll(/(?:請求\s*id|\bid)\s*[:：]?\s*(\d{1,5})/gi)].map((m) => String(Number(m[1])));
  if (ids.length) {
    const people = cands.filter((c) => ids.includes(String(Number(c.invoiceNo))));
    if (people.length === 0) return { error: `請求ID ${ids.join("・")} の人が見つかりませんでした` };
    // 宛名がその人の企業 = 企業への請求書。そうでなく、パートナー経由で企業の請求が済んでいれば パートナーの請求書
    const toCompany = people.some(companyHit) || people.every((c) => !hasPartner(c) || !done(c, "invoice"));
    return { kind: toCompany ? "invoice" : "partnerInvoice", people };
  }

  // 2) 企業への請求書 (宛名・メッセージの企業名)。まだ請求していない人を優先、全員済なら最近の差し替え
  const byCompany = cands.filter(companyHit);
  if (byCompany.length) {
    const open = byCompany.filter((c) => !done(c, "invoice"));
    const people = open.length ? open : byCompany.filter((c) => recent(c.b.invoiceDate, 60));
    if (people.length) return { kind: "invoice", people };
  }

  // 3) パートナーの請求書 (候補者名、無ければパートナー名で 1 人に絞れたとき)
  const pending = cands.filter((c) => hasPartner(c) && !done(c, "partnerInvoice"));
  const byName = pending.filter((c) =>
    c.name
      .normalize("NFKC")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .some((w) => nAll.includes(w)),
  );
  if (byName.length === 1) return { kind: "partnerInvoice", people: byName };
  if (byName.length > 1) {
    const both = byName.filter((c) => nAll.includes(norm(c.partner)));
    if (both.length === 1) return { kind: "partnerInvoice", people: both };
    return { error: `候補者が何人か当てはまりました (${byName.map((c) => `${c.name} 請求ID ${c.invoiceNo || "-"}`).join(" / ")})` };
  }
  const byPartner = pending.filter((c) => norm(c.partner).length >= 2 && nAll.includes(norm(c.partner)));
  if (byPartner.length === 1) return { kind: "partnerInvoice", people: byPartner };
  if (byPartner.length > 1) return { error: `${byPartner[0].partner} の請求が何件かあります (${byPartner.map((c) => `${c.name} 請求ID ${c.invoiceNo || "-"}`).join(" / ")})` };
  return { error: "だれの請求書か分かりませんでした" };
}

const slash = (ymd: string | null) => (ymd ? ymd.replace(/-/g, "/") : "-");
const man = (n: number | null) => (n == null ? "未入力" : n % 10000 === 0 ? `${n / 10000}万円` : n >= 10000 ? `${(n / 10000).toFixed(1)}万円` : `${n.toLocaleString("ja-JP")}円`);
const mention = (fallback: string) => slackConfig().mention || fallback;
const peopleLine = (people: Cand[]) => people.map((c) => `・${c.name}（請求ID ${c.invoiceNo || "-"}）`).join("\n");

type SlackFile = { name?: string; filetype?: string; mimetype?: string; url_private_download?: string; url_private?: string };

/** スレッド (チャンネル) に貼られたファイルを処理する */
export async function handleSlackFiles(ev: { channel: string; ts: string; thread_ts?: string; text?: string; files?: SlackFile[] }) {
  const thread = ev.thread_ts ?? ev.ts;
  const pdfs = (ev.files ?? []).filter((f) => f.filetype === "pdf" || f.mimetype === "application/pdf" || /\.pdf$/i.test(f.name ?? ""));
  if (pdfs.length === 0) return;
  for (const f of pdfs) {
    const fileName = f.name ?? "請求書.pdf";
    try {
      const cands = await loadCandidates();
      const m = matchInvoice(cands, fileName, ev.text ?? "");
      if ("error" in m) {
        await slackPost(ev.channel, `⚠️ ${fileName}\n${m.error}。メッセージに「請求ID 85」のように書いて、もう一度貼ってください。`, thread);
        continue;
      }
      const url = f.url_private_download ?? f.url_private;
      if (!url) throw new Error("ファイルの URL がありません");
      const buf = await downloadSlackFile(url);
      const saved = await saveInvoicePdf({
        personIds: m.people.map((c) => c.personId),
        kind: m.kind,
        dataUrl: `data:application/pdf;base64,${buf.toString("base64")}`,
        fileName,
        by: BY,
      });
      if (m.kind === "invoice") {
        const company = m.people[0].company || "企業";
        const text = [`✅ ${company} への請求書を保存して「請求済」にしました`, peopleLine(m.people), `📁 ${saved.url}`].join("\n");
        const r = await slackPost(ev.channel, text, thread, textWithButton(text, BUTTON.payment, "入金を確認したら押してください"));
        if (r.ts) await prisma.slackBillingPost.create({ data: { channel: ev.channel, ts: r.ts, kind: "invoice", personIds: m.people.map((c) => c.personId) } });
      } else {
        await slackPost(ev.channel, [`✅ パートナーの請求書を保存して「受領済」にしました`, peopleLine(m.people), `📁 ${saved.url}`].join("\n"), thread);
        await postTransferRequest(ev.channel, thread, m.people.map((c) => c.personId));
      }
    } catch (e) {
      console.warn("Slack の請求書の保存に失敗:", e);
      await slackPost(ev.channel, `⚠️ ${fileName} を保存できませんでした: ${e instanceof Error ? e.message : String(e)}`, thread).catch(() => {});
    }
  }
}

/** 川村さんへ振込のお願い (パートナーの請求書を受け取ったら) */
async function postTransferRequest(channel: string, thread: string, personIds: number[]) {
  const cands = (await loadCandidates()).filter((c) => personIds.includes(c.personId));
  const text = [
    mention("@kawamura"),
    "パートナーへの振込をお願いします。",
    "",
    ...cands.flatMap((c) => [
      `【請求ID ${c.invoiceNo || "-"}】 パートナー：${c.partner || "-"}`,
      `案件名：${c.company || "-"}（${man(c.b.unitPrice)}）`,
      `対象者：${c.name}`,
      `入社日：${slash(c.b.joinDate)}`,
      `手数料：${man(c.b.partnerCost)}`,
      `振込期日：${slash(c.b.partnerPaidDate)}`,
      ...(c.b.partnerInvoiceUrl ? [`請求書：${c.b.partnerInvoiceUrl}`] : []),
      "ーーーーーーーーーーーー",
    ]),
  ].join("\n");
  const r = await slackPost(channel, text, thread, textWithButton(text, BUTTON.partnerPayment, "振り込んだら押してください"));
  if (!r.ts) return;
  await prisma.slackBillingPost.create({ data: { channel, ts: r.ts, kind: "transfer", personIds } });
  await prisma.personBilling.updateMany({ where: { personId: { in: personIds } }, data: { partnerTransferRequestedAt: todayJst(), updatedBy: BY } });
}

const BUTTON = {
  payment: { label: "入金を確認した", actionId: "billing_done", style: "primary" as const },
  partnerPayment: { label: "振り込んだ", actionId: "billing_done", style: "primary" as const },
  undo: { label: "取り消す", actionId: "billing_undo" },
};

/** アプリの投稿 (請求書を保存しました / 振込のお願い) を済 / 取り消しにする。済にしたら true */
async function setPostDone(channel: string, ts: string, done: boolean, by: string) {
  const post = await prisma.slackBillingPost.findUnique({ where: { channel_ts: { channel, ts } } });
  if (!post || (post.kind !== "invoice" && post.kind !== "transfer")) return null;
  const step: LedgerStepKey = post.kind === "invoice" ? "payment" : "partnerPayment";
  const today = todayJst();
  for (const personId of post.personIds) {
    const current = await prisma.personBilling.findUnique({ where: { personId }, include: { person: { select: { placement: { select: { id: true } } } } } });
    if (!current) continue;
    await prisma.personBilling.update({ where: { personId }, data: { ...billingPatchForStep(step, done, today, current), updatedBy: by } });
    const placementId = current.person.placement?.id;
    if (placementId) {
      await prisma.placementTask.updateMany({
        where: { placementId, billingStep: { in: step === "payment" ? ["payment"] : ["pa-payment"] } },
        data: done ? { doneAt: new Date(), doneBy: by } : { doneAt: null, doneBy: null },
      });
    }
  }
  const r = await writeBillingToSheet(post.personIds);
  if (r.error) console.warn("請求管理への反映に失敗:", r.error);
  return { post, step };
}

/** ボタンが押された (/api/slack/interactions) */
export async function handleSlackButton(p: { channel: string; ts: string; actionId: string; userId: string; userName: string; text: string }) {
  const done = p.actionId === "billing_done";
  const res = await setPostDone(p.channel, p.ts, done, p.userName || BY);
  if (!res) return;
  const what = res.step === "payment" ? "入金済" : "振込済";
  const md = `${todayJst().slice(5).replace("-", "/")} <@${p.userId}>`;
  const blocks = done
    ? textWithButton(p.text, BUTTON.undo, `☑️ *${what}* にしました（${md}）`)
    : textWithButton(p.text, BUTTON[res.step], `↩️ ${what}を取り消しました（${md}）`);
  await slackUpdate(p.channel, p.ts, p.text, blocks);
}

/** アプリの投稿に ✅ が付いた / 外された (ボタンの代わりにも使える) */
export async function handleSlackReaction(ev: { reaction: string; item: { channel?: string; ts?: string } }, added: boolean) {
  if (!CHECKS.has(ev.reaction.replace(/::skin-tone-\d$/, "")) || !ev.item.channel || !ev.item.ts) return;
  const res = await setPostDone(ev.item.channel, ev.item.ts, added, BY);
  if (!res) return;
  const what = res.step === "payment" ? "入金" : "振込";
  await slackPost(res.post.channel, added ? `☑️ ${what}を「済」にしました` : `↩️ ${what}の「済」を取り消しました`, res.post.ts);
}

/** /billing から、その月の請求スレッドを立てる (川村さんへの請求書の発行依頼) */
export async function postBillingThread(text: string) {
  const { channel } = slackConfig();
  if (!channel) throw new Error("SLACK_BILLING_CHANNEL が未設定です");
  const body = text.replace(/^@kawamura cc @APRILIA CINDY MARANATHA ROHI/, mention("@kawamura cc @APRILIA CINDY MARANATHA ROHI"));
  const r = await slackPost(channel, `${body}\n\n請求書の PDF はこのスレッドに貼ってください (アプリが Drive に保存して「請求済」にします)`);
  if (!r.ok || !r.ts) throw new Error(`Slack に投稿できませんでした: ${r.error ?? ""}`);
  await prisma.slackBillingPost.create({ data: { channel, ts: r.ts, kind: "thread", personIds: [] } });
  return { ts: r.ts };
}
