"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 請求管理「内定者」タブ。入社前で、まだ請求のカード (台帳の行) が無い人の請求の項目を先に入れておく。
 * 欄を離れると保存し、企業データベースの請求管理にも書く。入社すると「企業」「PA」「まとめ」に行が出る。
 */
export type OfferRow = {
  personId: number;
  displayId: string;
  personName: string;
  companyName: string;
  partnerName: string;
  /** パートナー経由 (PA への支払いがある) */
  viaPartner: boolean;
  acceptedAt: string;
  joinPlannedAt: string;
  placementId: number | null;
  unitPrice: number | null;
  invoiceAmount: number | null;
  partnerCost: number | null;
  invoiceDate: string;
  dueDate: string;
  note: string;
};

type Key = "unitPrice" | "invoiceAmount" | "partnerCost" | "invoiceDate" | "dueDate" | "note";

const digits = (s: string) => s.replace(/[^0-9]/g, "");
const comma = (s: string) => (s ? Number(s).toLocaleString("ja-JP") : "");
const slash = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

export default function OfferTab({ rows }: { rows: OfferRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-700">入社前の内定者はいません</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="whitespace-nowrap bg-gray-50 text-left text-xs font-bold text-[var(--color-text-dark)]">
          <tr>
            <th className="px-3 py-2.5">内定者 ・ 企業</th>
            <th className="px-3 py-2.5">パートナー</th>
            <th className="px-3 py-2.5">承諾 / 入社予定</th>
            <th className="px-3 py-2.5">単価 (税抜)</th>
            <th className="px-3 py-2.5">請求金額 (税込)</th>
            <th className="px-3 py-2.5">PA への支払い</th>
            <th className="px-3 py-2.5">請求日</th>
            <th className="px-3 py-2.5">入金期日</th>
            <th className="px-3 py-2.5">備考</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r) => (
            <Row key={r.personId} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row }: { row: OfferRow }) {
  const init = (k: Key) => {
    const v = row[k];
    return v == null ? "" : String(v);
  };
  const [values, setValues] = useState<Record<Key, string>>({
    unitPrice: init("unitPrice"),
    invoiceAmount: init("invoiceAmount"),
    partnerCost: init("partnerCost"),
    invoiceDate: init("invoiceDate"),
    dueDate: init("dueDate"),
    note: init("note"),
  });
  const [saved, setSaved] = useState<Record<Key, string>>(values);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  const save = async (patch: Partial<Record<Key, string>>) => {
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => saved[k as Key] !== v));
    if (Object.keys(changed).length === 0) return;
    setState("saving");
    try {
      const res = await fetch(`/api/billing/${row.personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: { ...changed, ...(row.viaPartner && row.partnerName ? { route: "パートナー", partnerName: row.partnerName } : {}) },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error);
      setSaved((s) => ({ ...s, ...changed }));
      setState("saved");
      setTimeout(() => setState((x) => (x === "saved" ? "" : x)), 1500);
    } catch {
      setState("error");
    }
  };

  const money = (k: "unitPrice" | "invoiceAmount" | "partnerCost", disabled = false) => (
    <input
      inputMode="numeric"
      disabled={disabled}
      value={comma(values[k])}
      placeholder={disabled ? "—" : "円"}
      onChange={(e) => {
        const v = digits(e.target.value);
        setValues((cur) => {
          const next = { ...cur, [k]: v };
          // 単価を入れたら、請求金額 (税込) が空 (または前の単価から出した額のまま) なら 10% を足して入れる
          const auto = (u: string) => (u ? String(Math.round(Number(u) * 1.1)) : "");
          if (k === "unitPrice" && (!cur.invoiceAmount || cur.invoiceAmount === auto(cur.unitPrice))) next.invoiceAmount = auto(v);
          return next;
        });
      }}
      onBlur={() => void save(k === "unitPrice" ? { unitPrice: values.unitPrice, invoiceAmount: values.invoiceAmount } : { [k]: values[k] })}
      className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right tabular-nums text-[var(--color-text-dark)] disabled:bg-gray-100"
    />
  );
  const date = (k: "invoiceDate" | "dueDate") => (
    <input
      type="date"
      value={values[k]}
      onChange={(e) => setValues((cur) => ({ ...cur, [k]: e.target.value }))}
      onBlur={() => void save({ [k]: values[k] })}
      className="w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-[var(--color-text-dark)]"
    />
  );

  return (
    <tr className="align-middle">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-gray-700">{row.displayId}</span>
          <Link href={`/personnel/${row.personId}/edit`} className="whitespace-nowrap font-bold text-[var(--color-text-dark)] hover:text-[var(--color-primary)] hover:underline">
            {row.personName}
          </Link>
          {state === "saving" ? <span className="text-xs text-gray-700">保存中…</span> : null}
          {state === "saved" ? <span className="text-xs font-semibold text-emerald-700">保存しました</span> : null}
          {state === "error" ? <span className="text-xs font-semibold text-red-700">保存できませんでした</span> : null}
        </div>
        <p className="text-xs font-medium text-gray-700">{row.companyName}</p>
      </td>
      <td className="px-3 py-2.5 text-[var(--color-text-dark)]">{row.viaPartner ? row.partnerName : "自社"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--color-text-dark)]">
        {slash(row.acceptedAt) || "—"} / {slash(row.joinPlannedAt) || "—"}
      </td>
      <td className="px-3 py-2.5">{money("unitPrice")}</td>
      <td className="px-3 py-2.5">{money("invoiceAmount")}</td>
      <td className="px-3 py-2.5">{money("partnerCost", !row.viaPartner)}</td>
      <td className="px-3 py-2.5">{date("invoiceDate")}</td>
      <td className="px-3 py-2.5">{date("dueDate")}</td>
      <td className="px-3 py-2.5">
        <input
          value={values.note}
          onChange={(e) => setValues((cur) => ({ ...cur, note: e.target.value }))}
          onBlur={() => void save({ note: values.note })}
          className="w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-[var(--color-text-dark)]"
        />
      </td>
    </tr>
  );
}
