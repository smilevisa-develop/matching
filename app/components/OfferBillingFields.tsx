"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 内定承諾にしたときのポップに出す、請求の入力欄 (パートナー経由の人だけ。入れなくても先へ進める)。
 * 親のポップの「保存」で register に渡した関数を呼ぶと、入れた欄だけ請求に保存する (空欄は今の値を消さない)。
 */
export type OfferBillingSave = () => Promise<void>;

type Loaded = {
  paRoute: boolean;
  partnerName: string;
  unitPrice: number | null;
  invoiceAmount: number | null;
  partnerCost: number | null;
};

const KEYS = ["unitPrice", "invoiceAmount", "partnerCost"] as const;
type Key = (typeof KEYS)[number];

const LABEL: Record<Key, string> = {
  unitPrice: "単価 (税抜)",
  invoiceAmount: "請求金額 (税込)",
  partnerCost: "PA への支払い",
};

const digits = (s: string) => s.replace(/[^0-9]/g, "");
const comma = (s: string) => (s ? Number(s).toLocaleString("ja-JP") : "");

export default function OfferBillingFields({
  personId,
  register,
}: {
  personId: number;
  register: (save: OfferBillingSave | null) => void;
}) {
  const [info, setInfo] = useState<Loaded | null>(null);
  const [values, setValues] = useState<Record<Key, string>>({ unitPrice: "", invoiceAmount: "", partnerCost: "" });
  const initial = useRef<Record<Key, string>>({ unitPrice: "", invoiceAmount: "", partnerCost: "" });
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/billing/${personId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok) return;
        setInfo(j);
        const v = {
          unitPrice: j.unitPrice ? String(j.unitPrice) : "",
          invoiceAmount: j.invoiceAmount ? String(j.invoiceAmount) : "",
          partnerCost: j.partnerCost ? String(j.partnerCost) : "",
        };
        initial.current = v;
        setValues(v);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [personId]);

  useEffect(() => {
    if (!info?.paRoute) {
      register(null);
      return;
    }
    register(async () => {
      const fields: Record<string, string> = {};
      for (const k of KEYS) {
        const v = valuesRef.current[k];
        // 入れた (変えた) 欄だけ送る。空にしたものは消さない
        if (v && v !== initial.current[k]) fields[k] = v;
      }
      if (Object.keys(fields).length === 0) return;
      const res = await fetch(`/api/billing/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { ...fields, route: "パートナー", partnerName: info.partnerName } }),
      });
      if (!res.ok) alert("請求の保存に失敗しました。請求管理の「内定者」タブで入れ直してください");
    });
    return () => register(null);
  }, [info, personId, register]);

  if (!info?.paRoute) return null;

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-bold text-[var(--color-text-dark)]">
        請求 ({info.partnerName} 経由)<span className="ml-1 font-medium text-gray-700">・ 分かる欄だけ</span>
      </p>
      {KEYS.map((k) => (
        <label key={k} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-xs font-semibold text-[var(--color-text-dark)]">{LABEL[k]}</span>
          <input
            inputMode="numeric"
            value={comma(values[k])}
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
            placeholder="円"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums text-[var(--color-text-dark)]"
          />
        </label>
      ))}
    </div>
  );
}
