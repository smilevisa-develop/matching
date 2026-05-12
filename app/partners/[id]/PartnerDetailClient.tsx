"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CHANNELS } from "@/lib/candidate-profile";
import RatingStars from "../RatingStars";

export type PartnerDetailData = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  linkStatus: string;
  contactName: string | null;
  notes: string | null;
  rating: number | null;
  ratingReason: string | null;
  lineUserId: string | null;
  messengerPsid: string | null;
  whatsappId: string | null;
  createdAt: string;
  updatedAt: string;
  deals: {
    id: number;
    title: string;
    status: string;
    requiredCount: number;
    recommendedCount: number;
    interviewCount: number;
    offerCount: number;
    contractCount: number;
    declineCount: number;
    rejectCount: number;
    acceptedAt: string | null;
    createdAt: string;
    companyId: number;
    companyName: string;
  }[];
  invoices: {
    id: number;
    invoiceDate: string | null;
    invoiceAmount: string | null;
    invoiceStatus: string;
    dealTitle: string | null;
    companyName: string | null;
  }[];
  persons: {
    id: number;
    name: string;
    nationality: string;
    residenceStatus: string;
    createdAt: string;
  }[];
};

export default function PartnerDetailClient({ initial }: { initial: PartnerDetailData }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial.name,
    country: initial.country ?? "",
    channel: initial.channel ?? "未設定",
    linkStatus: initial.linkStatus,
    contactName: initial.contactName ?? "",
    notes: initial.notes ?? "",
    rating: initial.rating ?? 0,
    ratingReason: initial.ratingReason ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((c) => ({ ...c, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert("パートナー名を入力してください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${initial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rating: form.rating || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`更新失敗: ${data.error ?? res.statusText}`);
        return;
      }
      setDirty(false);
      router.refresh();
      alert("保存しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`「${initial.name}」を削除しますか？この操作は取り消せません。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/partners/${initial.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`削除失敗: ${data.error ?? res.statusText}`);
        return;
      }
      router.push("/partners");
    } finally {
      setDeleting(false);
    }
  };

  // 実績サマリー
  const summary = useMemo(() => {
    let req = 0,
      offer = 0,
      contract = 0;
    for (const d of initial.deals) {
      req += d.requiredCount ?? 0;
      offer += d.offerCount ?? 0;
      contract += d.contractCount ?? 0;
    }
    const invoiceTotal = initial.invoices.reduce((sum, inv) => {
      const n = Number(String(inv.invoiceAmount ?? "0").replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    return { dealCount: initial.deals.length, req, offer, contract, invoiceTotal };
  }, [initial]);

  return (
    <div className="space-y-6">
      {/* 編集フォーム */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">パートナー情報</h2>
          <div className="flex items-center gap-2">
            {dirty ? <span className="text-[11px] text-[#92400E]">未保存の変更</span> : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="パートナー名 *">
            <input className={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="国">
            <input className={INPUT} value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="主な連絡手段">
            <select className={INPUT} value={form.channel} onChange={(e) => set("channel", e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="連絡先紐づけ">
            <select
              className={INPUT}
              value={form.linkStatus}
              onChange={(e) => set("linkStatus", e.target.value)}
            >
              <option value="未">未</option>
              <option value="完了">完了</option>
            </select>
          </Field>
          <Field label="担当者名">
            <input
              className={INPUT}
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </Field>
          <Field label="評価 (1〜5)">
            <RatingStars value={form.rating} onChange={(v) => set("rating", v)} />
          </Field>
          <Field label="評価理由" className="md:col-span-2">
            <textarea
              className={`${INPUT} min-h-20`}
              value={form.ratingReason}
              onChange={(e) => set("ratingReason", e.target.value)}
              placeholder="例: スピード対応 / 候補者の質が高い など"
            />
          </Field>
          <Field label="メモ" className="md:col-span-2">
            <textarea
              className={`${INPUT} min-h-24`}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* 連絡先 ID (読み取り専用) */}
      {(initial.lineUserId || initial.messengerPsid || initial.whatsappId) ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">連絡先 ID</h2>
          <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
            {initial.lineUserId ? (
              <div>
                <dt className="text-xs text-gray-500">LINE ID</dt>
                <dd className="font-mono text-[12.5px] text-[var(--color-text-dark)] truncate">{initial.lineUserId}</dd>
              </div>
            ) : null}
            {initial.messengerPsid ? (
              <div>
                <dt className="text-xs text-gray-500">Messenger PSID</dt>
                <dd className="font-mono text-[12.5px] text-[var(--color-text-dark)] truncate">{initial.messengerPsid}</dd>
              </div>
            ) : null}
            {initial.whatsappId ? (
              <div>
                <dt className="text-xs text-gray-500">WhatsApp</dt>
                <dd className="font-mono text-[12.5px] text-[var(--color-text-dark)] truncate">{initial.whatsappId}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* 実績サマリー */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">過去の実績</h2>
        <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-5">
          <SummaryCard label="案件数" value={summary.dealCount.toLocaleString()} />
          <SummaryCard label="募集人数 合計" value={summary.req.toLocaleString()} />
          <SummaryCard label="内定 合計" value={summary.offer.toLocaleString()} />
          <SummaryCard label="成約 合計" value={summary.contract.toLocaleString()} />
          <SummaryCard label="請求 合計" value={`¥${summary.invoiceTotal.toLocaleString()}`} />
        </div>

        <h3 className="mt-6 text-sm font-semibold text-[var(--color-text-dark)]">案件一覧</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-gray-600">
                <th className="px-3 py-2">案件</th>
                <th className="px-3 py-2 w-32">企業</th>
                <th className="px-3 py-2 w-24">ステータス</th>
                <th className="px-3 py-2 w-16 text-right">募集</th>
                <th className="px-3 py-2 w-16 text-right">内定</th>
                <th className="px-3 py-2 w-16 text-right">成約</th>
                <th className="px-3 py-2 w-24">受注日</th>
              </tr>
            </thead>
            <tbody>
              {initial.deals.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/companies/deals/${d.id}`} className="text-[var(--color-primary)] hover:underline">
                      {d.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    <Link href={`/companies/${d.companyId}`} className="hover:underline">
                      {d.companyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{d.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.requiredCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.offerCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.contractCount}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {d.acceptedAt
                      ? new Date(d.acceptedAt).toLocaleDateString("ja-JP")
                      : new Date(d.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
              {initial.deals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                    まだ案件がありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {initial.invoices.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-[var(--color-text-dark)]">請求一覧 (直近 30 件)</h3>
            <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-gray-600">
                    <th className="px-3 py-2 w-28">請求日</th>
                    <th className="px-3 py-2">案件</th>
                    <th className="px-3 py-2 w-32">企業</th>
                    <th className="px-3 py-2 w-28 text-right">金額</th>
                    <th className="px-3 py-2 w-20">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">
                        {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("ja-JP") : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{inv.dealTitle ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600">{inv.companyName ?? "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {inv.invoiceAmount ? `¥${Number(String(inv.invoiceAmount).replace(/[^\d.-]/g, "")).toLocaleString()}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{inv.invoiceStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {initial.persons.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-[var(--color-text-dark)]">紐づく候補者 (直近 50 件)</h3>
            <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-gray-600">
                    <th className="px-3 py-2 w-16">ID</th>
                    <th className="px-3 py-2">氏名</th>
                    <th className="px-3 py-2 w-28">国籍</th>
                    <th className="px-3 py-2 w-32">在留資格</th>
                    <th className="px-3 py-2 w-28">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.persons.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-0 font-mono text-[12.5px] text-[var(--color-primary)]">
                        <Link href={`/personnel/${p.id}/edit`} className="block px-3 py-2">
                          #{p.id}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/personnel/${p.id}/edit`} className="block px-3 py-2">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.nationality}</td>
                      <td className="px-3 py-2 text-gray-600">{p.residenceStatus}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {new Date(p.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-[var(--color-light)]/50 px-4 py-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-text-dark)] tabular-nums">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";
