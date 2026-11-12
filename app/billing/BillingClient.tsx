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
  /** 候補者ID (4 桁。請求管理の ID) */
  displayId: string;
  /** 請求書ID (請求管理シートの通し番号) */
  invoiceNo: string;
  offerAt: string;
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

/** 線のアイコン (24x24) */
function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICON = {
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12l5 5L20 7",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
  open: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  building: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18",
  handshake: "M8 12l3 3 6-6M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0",
  bank: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  close: "M6 15l6-6 6 6",
};

/** "YYYY-MM" の n か月後の月末 (YYYY-MM-DD) */
function monthEnd(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n + 1, 0));
  return d.toISOString().slice(0, 10);
}

export default function BillingClient({
  rows: initial,
  me,
  month,
  partners,
  header,
}: {
  rows: LedgerRow[];
  me: string;
  /** 表示している月 (YYYY-MM)。この月に請求するのは前の月に入社した人 */
  month: string;
  /** 登録済みのパートナー (選ぶ欄の候補) */
  partners: string[];
  /** タイトルと月の切り替え (タブと一緒に上に固定する) */
  header?: React.ReactNode;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"company" | "partner" | "pay" | "ledger">("company");
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);


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

  /** 段階の状況 (表示だけ。済にするのは詳細・編集のチェック、または請求書の PDF を上げたとき) */
  const cell = (row: LedgerRow, key: StepKey) => {
    const st = row.steps[key];
    if (!st) return <span className="text-xs text-gray-500">対象外</span>;
    if (st.done)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
          <Icon d={ICON.check} className="h-3.5 w-3.5" />済{st.doneAt ? ` ${md(st.doneAt)}` : ""}
        </span>
      );
    if (st.overdue)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
          {md(st.due)} 期限切れ
        </span>
      );
    return <span className="text-xs font-medium text-gray-800">{st.due ? `${md(st.due)} まで` : "日付なし"}</span>;
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

  const upload = async (r: LedgerRow, kind: "invoice" | "partnerInvoice", file: File) => {
    if (file.type !== "application/pdf") {
      alert("PDF を選んでください");
      return;
    }
    setUploading(`${r.personId}-${kind}`);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const res = await fetch(`/api/billing/${r.personId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileName: file.name, dataUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || String(res.status));
      const t = today();
      const key: StepKey = kind === "invoice" ? "invoice" : "partnerInvoice";
      setRows((prev) =>
        prev.map((x) => {
          if (x.personId !== r.personId) return x;
          const st = x.steps[key];
          const steps = st ? { ...x.steps, [key]: { ...st, done: true, overdue: false, doneAt: t, doneBy: me } } : x.steps;
          return {
            ...x,
            ...(kind === "invoice" ? { invoiceUrl: json.url, invoiceDate: x.invoiceDate || t } : { partnerInvoiceUrl: json.url }),
            steps,
            open: Object.values(steps).some((v) => v && !v.done),
          };
        }),
      );
      setDraft((d) => (d ? { ...d, ...(kind === "invoice" ? { invoiceUrl: json.url } : { partnerInvoiceUrl: json.url }) } : d));
    } catch (e) {
      alert(`アップロードに失敗しました: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setUploading(null);
    }
  };

  const uploadBox = (r: LedgerRow, kind: "invoice" | "partnerInvoice", label: string, url: string) => {
    const busyNow = uploading === `${r.personId}-${kind}`;
    const isLink = /^https?:\/\//.test(url);
    const done = !!url;
    return (
      <div className={`md:col-span-2 flex items-center gap-3 rounded-xl border-2 px-4 py-3 ${done ? "border-emerald-300 bg-emerald-50" : "border-dashed border-[var(--color-primary)] bg-white"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-600 text-white" : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"}`}>
          <Icon d={done ? ICON.check : ICON.file} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--color-text-dark)]">{label}</p>
          {isLink ? (
            <p className="text-xs text-gray-700">押すと PDF が開きます</p>
          ) : (
            <p className="text-xs text-gray-700">{url ? "スプシにあり" : "上げると「済」になります"}</p>
          )}
        </div>
        {isLink ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Icon d={ICON.file} />
            開く
            <Icon d={ICON.open} className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <label
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${
            done ? "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50" : "bg-[var(--color-primary)] text-white hover:opacity-90"
          } ${busyNow ? "pointer-events-none opacity-50" : ""}`}
        >
          <Icon d={ICON.upload} />
          {busyNow ? "保存中…" : done ? "差し替え" : "PDF を上げる"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(r, kind, f);
            }}
          />
        </label>
      </div>
    );
  };

  // それぞれの段階でやることが残っている人 (その段階を済にしたら一覧から消える)。期限がこの月の末までの人
  const monthEndStr = monthEnd(month, 0);
  const dueBy = (st: LedgerStep | null) => !!st && !st.done && !!st.due && st.due <= monthEndStr;
  const byJoin = (a: LedgerRow, b: LedgerRow) => ((a.joinAt || "9") < (b.joinAt || "9") ? -1 : 1);
  const toInvoice = rows.filter((r) => dueBy(r.steps.invoice)).sort(byJoin);
  const toRequest = rows.filter((r) => r.route !== "自社" && dueBy(r.steps.partnerInvoice)).sort(byJoin);
  const byPartner = new Map<string, LedgerRow[]>();
  for (const r of toRequest) {
    const k = r.partnerName || "パートナー未設定";
    byPartner.set(k, [...(byPartner.get(k) ?? []), r]);
  }
  // 振込の依頼: パートナーの請求書が届いていて、まだ振り込んでいない人 (月に関係なく。請求書が遅れて月がずれることがあるため)
  const payDueOf = (r: LedgerRow) => r.steps.partnerPayment?.due || (r.joinAt ? monthEnd(r.joinAt.slice(0, 7), 2) : "");
  const toPay = rows
    .filter((r) => r.route !== "自社" && r.steps.partnerInvoice?.done && !!r.steps.partnerPayment && !r.steps.partnerPayment.done)
    .sort((a, b) => (payDueOf(a) < payDueOf(b) ? -1 : 1));
  // まとめ: どこかの段階が残っている人 (全部済むまで出す)。
  // まだ入社していない (入社日が無く、どの段階も手を付けていない) 人は出さない
  const started = (r: LedgerRow) => !!r.joinAt || stepsOf(r).some((st) => st.done);
  const openRows = rows.filter((r) => (r.open && started(r)) || r.personId === editing).sort(byJoin);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      alert("コピーできませんでした");
    }
  };
  // Slack に貼る文 (トゥイさんがこれまで送っていた形に合わせる。2026/11 の #請求管理_to_お客様 / #請求管理_to_パートナー)
  const MENTION = "@kawamura cc @APRILIA CINDY MARANATHA ROHI";
  const LINE = "ーーーーーーーーーーーー";
  const num = (i: number) => (i < 20 ? String.fromCharCode(0x2460 + i) : `(${i + 1})`);
  const slash = (ymd: string) => (ymd ? ymd.replace(/-/g, "/") : "-");
  const man = (n: number | null) => (n == null ? "未入力" : n % 10000 === 0 ? `${n / 10000}万円` : n >= 10000 ? `${(n / 10000).toFixed(1)}万円` : `${n.toLocaleString("ja-JP")}円`);
  const companyText = [
    MENTION,
    `${Number(month.slice(5))}月頭に請求する内容です。よろしくお願いいたします。`,
    "",
    ...toInvoice.flatMap((r, i) => [
      `${num(i)} 請求ID: ${r.invoiceNo || "-"}`,
      r.personName,
      `案件名：${r.companyName || "-"}`,
      `内定日：${slash(r.offerAt)}`,
      `入社日：${slash(r.joinAt)}`,
      `手数料：${man(r.unitPrice)}`,
      `入金期日：${slash(r.dueDate || r.steps.payment?.due || "")}`,
      LINE,
    ]),
  ].join("\n");
  const partnerText = (name: string, list: LedgerRow[]) =>
    [
      `${name} 様`,
      "請求書の発行をお願いいたします。",
      "",
      ...list.flatMap((r, i) => [
        `${num(i)} ID: ${r.displayId}`,
        r.personName,
        `入社日：${slash(r.joinAt)}`,
        `手数料：${man(r.costAmount)}`,
        `入金期日：${slash(r.steps.partnerPayment?.due || "")}`,
        LINE,
      ]),
    ].join("\n");
  const payMonths = [...new Set(toPay.map((r) => payDueOf(r).slice(5, 7)).filter(Boolean))];
  const payText = [
    MENTION,
    `${payMonths.length === 1 ? `${Number(payMonths[0])}月の` : ""}振り込み件です。よろしくお願いいたします。`,
    "",
    ...toPay.flatMap((r, i) => [
      `${num(i)}【請求ID ${r.invoiceNo || "-"}】 パートナー：${r.partnerName || "-"}`,
      `案件名：${r.companyName || "-"}（${man(r.unitPrice)}）`,
      `対象者：${r.personName}`,
      `内定日：${slash(r.offerAt)}`,
      `入社日：${slash(r.joinAt)}`,
      `手数料：${man(r.costAmount)}`,
      `振込期日：${slash(payDueOf(r))}`,
      ...(/^https?:\/\//.test(r.partnerInvoiceUrl) ? [`請求書：${r.partnerInvoiceUrl}`] : []),
      LINE,
    ]),
  ].join("\n");

  const copyButton = (key: string, text: string) => (
    <button
      type="button"
      onClick={() => void copy(key, text)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
        copied === key ? "bg-emerald-600 text-white" : "bg-[var(--color-primary)] text-white hover:opacity-90"
      }`}
    >
      <Icon d={copied === key ? ICON.check : ICON.copy} />
      {copied === key ? "コピー済み" : "コピー"}
    </button>
  );

  /** 見出し (左にタイトルと件数、右にコピー) */
  const head = (title: string, count: number, copyKey?: string, text?: string) => (
    <div className="flex items-center gap-3">
      <h2 className="font-bold text-[var(--color-text-dark)]">{title}</h2>
      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-800">{count}件</span>
      {copyKey && text && count > 0 ? <span className="ml-auto">{copyButton(copyKey, text)}</span> : null}
    </div>
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
            <label className="block text-xs font-medium text-gray-700">
              パートナー (選ぶか入力)
              <input
                className={`${INPUT} mt-1`}
                list="billing-partners"
                value={draft?.partnerName ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, partnerName: e.target.value } : d))}
              />
              <datalist id="billing-partners">
                {partners.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            {field("パートナーへの支払い (仕入高)", "partnerCost", "yen")}
            {field("パートナーへの支払日", "partnerPaidDate", "date")}
          </>
        )}
        {uploadBox(r, "invoice", "企業への請求書", r.invoiceUrl)}
        {draft?.route === "自社" ? null : uploadBox(r, "partnerInvoice", "パートナーの請求書", r.partnerInvoiceUrl)}
        {r.hasPlacement ? null : field("入社日", "joinDate", "date")}
        <div className="md:col-span-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-300 bg-white px-4 py-3">
          <span className="text-xs font-bold text-gray-800">済にする</span>
          {COLUMNS.map((c) => {
            const st = r.steps[c.key];
            if (!st) return null;
            return (
              <label key={c.key} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-text-dark)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={st.done}
                  disabled={busy === `${r.personId}-${c.key}`}
                  onChange={() => void toggle(r, c.key)}
                />
                {c.label.replace(/^[①-④] /, "")}（{c.sub}）
              </label>
            );
          })}
        </div>
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

  /** 台帳 (まとめと同じ形。段階のボタン・詳細・編集つき) */
  const ledger = (list: LedgerRow[], empty: string) => (
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
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-700">{empty}</p>
        ) : (
          list.map((r) => (
            <Fragment key={r.personId}>
              <div id={`bill-${r.personId}`} className={`${GRID} scroll-mt-4 border-b border-gray-200 ${editing === r.personId ? "bg-gray-50" : ""}`}>
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
                    <span className="inline-flex items-center gap-1.5">
                      <Icon d={editing === r.personId ? ICON.close : ICON.edit} className="h-3.5 w-3.5" />
                      {editing === r.personId ? "閉じる" : "詳細・編集"}
                    </span>
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
                      {r.costAmount ? (
                        <span className="mt-0.5 text-xs text-gray-700">PA {yen(r.costAmount)}</span>
                      ) : r.route !== "自社" && r.partnerName ? (
                        <button type="button" onClick={() => openEditor(r)} className="mt-1 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                          PA 金額を入れる
                        </button>
                      ) : null}
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
  );

  const tabs = [
    { key: "company", label: "請求書の依頼", icon: ICON.building, count: toInvoice.length },
    { key: "partner", label: "パートナーへ依頼", icon: ICON.handshake, count: toRequest.length },
    { key: "pay", label: "振込の依頼", icon: ICON.bank, count: toPay.length },
    { key: "ledger", label: "まとめ", icon: ICON.list, count: openRows.length, alert: summary.overdue > 0 },
  ] as const;

  return (
    <div className="space-y-4">
      {/* スクロールしてもタイトル・月・タブ (まとめでは数字の帯も) を上に固定する */}
      <div className="sticky top-0 z-20 -mx-8 space-y-3 bg-[var(--background)] px-8 pb-3 pt-8 shadow-[0_6px_8px_-8px_rgba(0,0,0,0.25)]">
      {header}
      <nav className="flex flex-wrap gap-1 border-b border-gray-300">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px inline-flex items-center gap-2 border-b-[3px] px-4 py-2.5 text-sm font-bold ${
              tab === t.key ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-gray-700 hover:text-[var(--color-text-dark)]"
            }`}
          >
            <Icon d={t.icon} />
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                "alert" in t && t.alert ? "bg-red-600 text-white" : tab === t.key ? "bg-[var(--color-primary)] text-white" : "bg-gray-200 text-gray-800"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </nav>
      {tab === "ledger" && (
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
      )}
      </div>

      {tab === "company" && (
        <div className="space-y-3">
          {head("川村さんへ ・ 企業への請求書の発行依頼", toInvoice.length, "company", companyText)}
          {ledger(toInvoice, "請求書を出す人はいません")}
        </div>
      )}

      {tab === "partner" && (
        <div className="space-y-5">
          {byPartner.size === 0 ? ledger([], "パートナーに依頼する人はいません") : null}
          {[...byPartner.entries()].map(([name, list]) => (
            <div key={name} className="space-y-3">
              {head(`${name} 様へ ・ 請求書の発行依頼`, list.length, `pa-${name}`, partnerText(name, list))}
              {ledger(list, "")}
            </div>
          ))}
        </div>
      )}

      {tab === "pay" && (
        <div className="space-y-3">
          {head("川村さんへ ・ パートナーへの振込依頼", toPay.length, "pay", payText)}
          {ledger(toPay, "振込を待っている請求書はありません")}
        </div>
      )}

      {tab === "ledger" && (
        <div className="space-y-3">
          {ledger(openRows, "終わっていない請求はありません")}
        </div>
      )}
    </div>
  );
}
