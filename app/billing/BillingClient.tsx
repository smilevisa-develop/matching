"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

export type LedgerStep = {
  due: string;
  done: boolean;
  doneAt: string;
  doneBy: string;
  owner: string;
  overdue: boolean;
  inMonth: boolean;
};

type StepKey = "invoice" | "payment" | "partnerInvoice" | "partnerPayment";

export type LedgerRow = {
  personId: number;
  personName: string;
  companyName: string;
  /** 企業 (求人) の担当者。請求・入金確認・パートナーへの支払いまで全部この人 */
  owner: string;
  joinAt: string;
  /** 内定者管理にカードがある人 (無い人は入社日をここで入れる) */
  hasPlacement: boolean;
  placementId: number | null;
  route: string;
  partnerName: string;
  unitPrice: number | null;
  invoiceAmount: number | null;
  costAmount: number | null;
  invoiceDate: string;
  dueDate: string;
  partnerPaidDate: string;
  invoiceUrl: string;
  partnerInvoiceUrl: string;
  note: string;
  steps: Record<StepKey, LedgerStep | null>;
  inMonth: boolean;
  open: boolean;
};

const COLUMNS: { key: StepKey; label: string; sub: string }[] = [
  { key: "invoice", label: "① 請求", sub: "企業へ送る" },
  { key: "payment", label: "② 入金", sub: "入金を確認" },
  { key: "partnerInvoice", label: "③ PA請求書", sub: "PAから受取" },
  { key: "partnerPayment", label: "④ PA支払", sub: "PAへ支払う" },
];

const md = (ymd: string) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "");
const yen = (n: number | null) => (n == null ? "" : `¥${Math.round(n).toLocaleString("ja-JP")}`);
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const GRID = "grid min-w-[1080px] grid-cols-[minmax(0,2.2fr)_0.55fr_0.85fr_repeat(4,minmax(0,1fr))] divide-x divide-gray-200";
const INPUT = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-[var(--color-text-dark)]";

type Draft = {
  unitPrice: string;
  invoiceAmount: string;
  route: string;
  partnerName: string;
  partnerCost: string;
  invoiceDate: string;
  dueDate: string;
  partnerPaidDate: string;
  invoiceUrl: string;
  partnerInvoiceUrl: string;
  joinDate: string;
  note: string;
};

const draftOf = (r: LedgerRow): Draft => ({
  unitPrice: r.unitPrice?.toString() ?? "",
  invoiceAmount: r.invoiceAmount?.toString() ?? "",
  route: r.route,
  partnerName: r.partnerName,
  partnerCost: r.costAmount?.toString() ?? "",
  invoiceDate: r.invoiceDate,
  dueDate: r.dueDate,
  partnerPaidDate: r.partnerPaidDate,
  invoiceUrl: r.invoiceUrl,
  partnerInvoiceUrl: r.partnerInvoiceUrl,
  joinDate: r.joinAt,
  note: r.note,
});

/**
 * 請求管理の台帳。1 人 1 行で、4 つの段階を色の丸で並べる (灰 = 予定 / 赤 = 期限切れ / 緑 = 済)。
 * 丸を押すと済 (もう一度押すと取り消し)。名前を押すと金額・パートナー・請求書リンクを直せる。
 * 保存した内容は企業データベースの請求管理に入る。
 */
const stepsOf = (r: LedgerRow) => Object.values(r.steps).filter((s): s is LedgerStep => !!s);
const overdueOf = (r: LedgerRow) => stepsOf(r).some((s) => s.overdue);

export default function BillingClient({ rows: initial, me }: { rows: LedgerRow[]; me: string }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const visible = rows.filter((r) => r.inMonth || overdueOf(r));

  const summary = useMemo(() => {
    const sum = (list: LedgerRow[], pick: (r: LedgerRow) => number | null) => list.reduce((t, r) => t + (pick(r) ?? 0), 0);
    const invoices = rows.filter((r) => r.steps.invoice?.inMonth);
    const payments = rows.filter((r) => r.steps.payment?.inMonth);
    const partnerPays = rows.filter((r) => r.steps.partnerPayment?.inMonth);
    const invoiceTotal = sum(invoices, (r) => r.invoiceAmount);
    return {
      invoiceCount: invoices.length,
      invoiceTotal,
      profit: invoiceTotal - sum(invoices, (r) => r.costAmount),
      paymentTotal: sum(payments, (r) => r.invoiceAmount),
      paidTotal: sum(payments.filter((r) => r.steps.payment?.done), (r) => r.invoiceAmount),
      partnerTotal: sum(partnerPays, (r) => r.costAmount),
      partnerCount: partnerPays.length,
      overdue: rows.filter(overdueOf).length,
    };
  }, [rows]);

  const patch = async (personId: number, body: object) => {
    const res = await fetch(`/api/billing/${personId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || String(res.status));
  };

  const toggle = async (row: LedgerRow, key: StepKey) => {
    const step = row.steps[key];
    if (!step || busy) return;
    const done = !step.done;
    if (!done && !window.confirm("「済」を取り消しますか？")) return;
    setBusy(`${row.personId}-${key}`);
    try {
      await patch(row.personId, { step: key, done });
      const t = today();
      setRows((prev) =>
        prev.map((r) => {
          if (r.personId !== row.personId) return r;
          const steps = { ...r.steps, [key]: { ...step, done, overdue: done ? false : !!step.due && step.due < t, doneAt: done ? t : "", doneBy: done ? me : "" } };
          const extra =
            key === "invoice" && done
              ? { invoiceDate: r.invoiceDate || t, dueDate: r.dueDate || `${t.slice(0, 8)}${new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0).getDate()}` }
              : key === "partnerPayment"
                ? { partnerPaidDate: done ? r.partnerPaidDate || t : "" }
                : {};
          return { ...r, ...extra, steps, open: Object.values(steps).some((s) => s && !s.done) };
        }),
      );
    } catch (e) {
      alert(`保存に失敗しました: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(null);
    }
  };

  const openEditor = (r: LedgerRow) => {
    if (editing === r.personId) {
      setEditing(null);
      return;
    }
    setEditing(r.personId);
    setDraft(draftOf(r));
  };

  const save = async (r: LedgerRow) => {
    if (!draft) return;
    setBusy(`${r.personId}-save`);
    try {
      const fields: Record<string, string> = { ...draft };
      if (r.hasPlacement) delete fields.joinDate;
      await patch(r.personId, { fields });
      const n = (v: string) => (v.trim() ? Math.round(Number(v.replace(/[^0-9.-]/g, ""))) : null);
      setRows((prev) =>
        prev.map((x) =>
          x.personId === r.personId
            ? {
                ...x,
                unitPrice: n(draft.unitPrice),
                invoiceAmount: n(draft.invoiceAmount),
                costAmount: n(draft.partnerCost),
                route: draft.route,
                partnerName: draft.partnerName,
                invoiceDate: draft.invoiceDate,
                dueDate: draft.dueDate,
                partnerPaidDate: draft.partnerPaidDate,
                invoiceUrl: draft.invoiceUrl,
                partnerInvoiceUrl: draft.partnerInvoiceUrl,
                note: draft.note,
                joinAt: r.hasPlacement ? x.joinAt : draft.joinDate,
              }
            : x,
        ),
      );
      setEditing(null);
    } catch (e) {
      alert(`保存に失敗しました: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(null);
    }
  };

  const cell = (row: LedgerRow, key: StepKey) => {
    const s = row.steps[key];
    if (!s) return <span className="block text-center text-sm text-gray-500">対象外</span>;
    const tone = s.done
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : s.overdue
        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
        : "border-gray-300 bg-white text-[var(--color-text-dark)] hover:border-[var(--color-primary)] hover:bg-gray-50";
    const main = s.done ? "✓ 済" : s.due ? `${md(s.due)} まで` : "日付なし";
    const by = s.doneBy && !s.doneBy.startsWith("請求管理") ? ` ${s.doneBy}` : "";
    const sub = s.done ? (s.doneAt ? `${md(s.doneAt)}${by}` : "完了") : s.overdue ? "期限切れ" : "予定";
    return (
      <button
        type="button"
        onClick={() => void toggle(row, key)}
        disabled={busy === `${row.personId}-${key}`}
        title={s.done ? "押すと取り消し" : "押すと済にする"}
        className={`flex w-full min-w-0 flex-col items-start rounded-lg border px-3 py-2 text-left shadow-sm transition disabled:opacity-50 ${tone}`}
      >
        <span className="whitespace-nowrap text-sm font-bold tabular-nums">{main}</span>
        <span className="mt-0.5 truncate text-xs font-medium opacity-90">{sub}</span>
      </button>
    );
  };

  const field = (label: string, key: keyof Draft, type: "text" | "date" | "yen" = "text", wide = false) => (
    <label className={`block text-xs font-medium text-gray-700 ${wide ? "md:col-span-2" : ""}`}>
      {label}
      <input
        className={`${INPUT} mt-1 ${type === "yen" ? "text-right tabular-nums" : ""}`}
        type={type === "date" ? "date" : "text"}
        inputMode={type === "yen" ? "numeric" : undefined}
        value={draft?.[key] ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setDraft((d) => {
            if (!d) return d;
            const next = { ...d, [key]: v };
            // 単価を入れたら、請求金額 (税込) を 1.1 倍で入れる (請求金額が空か、前の自動計算のままのとき)
            if (key === "unitPrice") {
              const before = Math.round(Number(d.unitPrice.replace(/[^0-9]/g, "")) * 1.1);
              const cur = Number(d.invoiceAmount.replace(/[^0-9]/g, ""));
              const unit = Number(v.replace(/[^0-9]/g, ""));
              if (!d.invoiceAmount.trim() || cur === before) next.invoiceAmount = unit ? String(Math.round(unit * 1.1)) : "";
            }
            return next;
          });
        }}
      />
    </label>
  );

  const editor = (r: LedgerRow) => (
    <div className="border-b border-gray-300 bg-gray-50 px-6 py-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field("単価 (税抜)", "unitPrice", "yen")}
        {field("請求金額 (税込)", "invoiceAmount", "yen")}
        {field("請求日", "invoiceDate", "date")}
        {field("入金期日", "dueDate", "date")}
        <label className="block text-xs font-medium text-gray-700">
          紹介
          <select className={`${INPUT} mt-1`} value={draft?.route ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, route: e.target.value } : d))}>
            <option value="">-</option>
            <option value="パートナー">パートナー経由</option>
            <option value="自社">自社</option>
          </select>
        </label>
        {draft?.route === "自社" ? null : (
          <>
            {field("パートナー", "partnerName")}
            {field("パートナーへの支払い (仕入高)", "partnerCost", "yen")}
            {field("パートナーへの支払日", "partnerPaidDate", "date")}
          </>
        )}
        {field("請求書のリンク", "invoiceUrl", "text", true)}
        {draft?.route === "自社" ? null : field("パートナーの請求書のリンク", "partnerInvoiceUrl", "text", true)}
        {r.hasPlacement ? null : field("入社日", "joinDate", "date")}
        {field("備考", "note", "text", true)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save(r)}
          disabled={busy === `${r.personId}-save`}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          保存
        </button>
        <button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-700 underline">
          閉じる
        </button>
        {r.hasPlacement ? (
          <Link href={`/onboarding?open=${r.placementId}`} className="ml-auto text-sm text-[var(--color-primary)] underline">
            内定者カードを開く
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap divide-x divide-gray-200 rounded-xl border border-gray-200 bg-white text-sm">
        {[
          { label: "この月の請求", value: `${summary.invoiceCount}件 ${yen(summary.invoiceTotal) || "¥0"}` },
          { label: "粗利", value: yen(summary.profit) || "¥0" },
          { label: "入金予定", value: yen(summary.paymentTotal) || "¥0", sub: `済 ${yen(summary.paidTotal) || "¥0"}` },
          { label: "PAへの支払い", value: `${summary.partnerCount}件 ${yen(summary.partnerTotal) || "¥0"}` },
          { label: "期限切れ", value: `${summary.overdue}件`, alert: summary.overdue > 0 },
        ].map((x) => (
          <div key={x.label} className="flex items-baseline gap-2 px-4 py-2">
            <span className={`text-xs font-medium ${x.alert ? "text-red-700" : "text-gray-700"}`}>{x.label}</span>
            <span className={`font-bold tabular-nums ${x.alert ? "text-red-700" : "text-[var(--color-text-dark)]"}`}>{x.value}</span>
            {x.sub ? <span className="text-xs font-medium text-emerald-700">{x.sub}</span> : null}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-300 bg-white shadow-sm">
        <div className={`${GRID} border-b border-gray-300 bg-gray-100 text-xs font-semibold text-gray-800`}>
          <span className="px-4 py-3">内定者 ・ 企業</span>
          <span className="px-4 py-3">入社日</span>
          <span className="px-4 py-3 text-right">請求金額</span>
          {COLUMNS.map((c) => (
            <span key={c.key} className="px-4 py-3">
              <span className="block text-sm">{c.label}</span>
              <span className="block font-medium text-gray-700">{c.sub}</span>
            </span>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-700">当てはまる請求はありません。</p>
        ) : (
          visible.map((r) => (
            <Fragment key={r.personId}>
              <div className={`${GRID} border-b border-gray-200 ${editing === r.personId ? "bg-gray-50" : ""}`}>
                <div className={`flex min-w-0 items-start gap-3 px-4 py-4 ${overdueOf(r) ? "border-l-4 border-l-red-500" : "border-l-4 border-l-transparent"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-[var(--color-text-dark)]">{r.personName}</p>
                    <p className="mt-1 truncate text-sm text-gray-800">{r.companyName || "企業未設定"}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-700">
                      {[`担当 ${r.owner || "未定"}`, r.route === "自社" ? "自社" : r.partnerName ? `PA ${r.partnerName}` : ""].filter(Boolean).join(" ・ ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditor(r)}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      editing === r.personId
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-primary)] bg-white text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                    }`}
                  >
                    {editing === r.personId ? "閉じる ▲" : "詳細・編集 ▼"}
                  </button>
                </div>
                <div className="flex items-center px-4 py-4 text-sm tabular-nums text-gray-800">{md(r.joinAt) || "-"}</div>
                <div className="flex flex-col items-end justify-center px-4 py-4 tabular-nums">
                  {r.invoiceAmount == null ? (
                    <button type="button" onClick={() => openEditor(r)} className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
                      金額を入れる
                    </button>
                  ) : (
                    <>
                      <span className="text-base font-bold text-[var(--color-text-dark)]">{yen(r.invoiceAmount)}</span>
                      {r.costAmount ? <span className="mt-0.5 text-xs text-gray-700">PA {yen(r.costAmount)}</span> : null}
                    </>
                  )}
                </div>
                {COLUMNS.map((c) => (
                  <div key={c.key} className="flex items-center px-3 py-4">
                    {cell(r, c.key)}
                  </div>
                ))}
              </div>
              {editing === r.personId ? editor(r) : null}
            </Fragment>
          ))
        )}
      </div>
      <p className="text-xs text-gray-700">各段階のボタンを押すと「済」(もう一度押すと取り消し)、「詳細・編集」で金額やリンクを直せます。金額・状況は請求管理シートの内容で、ここで直すとシートにも入ります。</p>
    </div>
  );
}
