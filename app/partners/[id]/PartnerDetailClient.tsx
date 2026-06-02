"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CHANNELS } from "@/lib/candidate-profile";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
  PARTNER_ROLES,
  RELATIONSHIP_STATUSES,
  parseCsv,
  toCsv,
} from "@/lib/partner-profile";
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
  role: string | null;
  hasPerformance: boolean;
  relationshipStatus: string | null;
  email: string | null;
  snsContact: string | null;
  features: string | null;
  introducibleNationalities: string | null;
  introducibleScope: string | null;
  introducibleFields: string | null;
  introducibleResidenceStatuses: string | null;
  feeAmount: string | null;
  minFeeAmount: string | null;
  feeShareRatio: string | null;
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
  ratingHistory: {
    id: number;
    rating: number | null;
    reason: string | null;
    recordedBy: string | null;
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
    role: initial.role ?? "",
    relationshipStatus: initial.relationshipStatus ?? "",
    email: initial.email ?? "",
    snsContact: initial.snsContact ?? "",
    features: initial.features ?? "",
    introducibleNationalities: parseCsv(initial.introducibleNationalities),
    introducibleScope: initial.introducibleScope ?? "",
    introducibleFields: parseCsv(initial.introducibleFields),
    introducibleResidenceStatuses: parseCsv(initial.introducibleResidenceStatuses),
    feeAmount: initial.feeAmount ?? "",
    minFeeAmount: initial.minFeeAmount ?? "",
    feeShareRatio: initial.feeShareRatio ?? "",
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
        body: JSON.stringify({
          ...form,
          rating: form.rating || null,
          introducibleNationalities: toCsv(form.introducibleNationalities),
          introducibleFields: toCsv(form.introducibleFields),
          introducibleResidenceStatuses: toCsv(form.introducibleResidenceStatuses),
        }),
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

        {/* 基本情報 */}
        <Group title="基本情報">
          <Field label="パートナー名 *">
            <input className={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="拠点国">
            <input className={INPUT} value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="役割">
            <select className={INPUT} value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="">未設定</option>
              {PARTNER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="関係性">
            <select
              className={INPUT}
              value={form.relationshipStatus}
              onChange={(e) => set("relationshipStatus", e.target.value)}
            >
              <option value="">未設定</option>
              {RELATIONSHIP_STATUSES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="担当者名">
            <input
              className={INPUT}
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </Field>
        </Group>

        {/* 連絡 */}
        <Group title="連絡">
          <Field label="メール">
            <input className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="example@example.com" />
          </Field>
          <Field label="SNS 連絡先">
            <input className={INPUT} value={form.snsContact} onChange={(e) => set("snsContact", e.target.value)} placeholder="LINE / Facebook URL など" />
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
          <Field label="連絡先紐づけ" className="md:col-span-2">
            <LinkStatusDisplay
              linkStatus={form.linkStatus}
              lineUserId={initial.lineUserId}
              messengerPsid={initial.messengerPsid}
              whatsappId={initial.whatsappId}
            />
          </Field>
        </Group>

        {/* 評価 */}
        <Group title="評価">
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
            <p className="mt-1 text-[11px] text-gray-400">
              評価か理由を変えて保存すると、下の「評価の推移」に履歴として残ります
            </p>
          </Field>
        </Group>
      </section>

      {/* 紹介可能 / 手数料 / メモ・特徴 (別セクション) */}
      <section className="rounded-2xl border border-gray-200 bg-[#FAF9F5] p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--color-text-dark)]">紹介条件・特徴</h2>
        <p className="mt-0.5 text-xs text-gray-500">どの人材を紹介できるか、手数料、強み・備考をまとめます。</p>

        {/* 紹介可能 */}
        <Group title="紹介可能">
          <Field label="紹介の範囲">
            <select
              className={INPUT}
              value={form.introducibleScope}
              onChange={(e) => set("introducibleScope", e.target.value)}
            >
              <option value="">未設定</option>
              {INTRODUCIBLE_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="紹介可能な国籍" className="md:col-span-2">
            <CheckboxGroup
              options={INTRODUCIBLE_NATIONALITIES as readonly string[]}
              values={form.introducibleNationalities}
              onChange={(next) => set("introducibleNationalities", next)}
            />
          </Field>
          <Field label="紹介可能な分野" className="md:col-span-2">
            <CheckboxGroup
              options={INTRODUCIBLE_FIELDS as readonly string[]}
              values={form.introducibleFields}
              onChange={(next) => set("introducibleFields", next)}
            />
          </Field>
          <Field label="紹介可能な在留資格" className="md:col-span-2">
            <CheckboxGroup
              options={INTRODUCIBLE_RESIDENCE_STATUSES as readonly string[]}
              values={form.introducibleResidenceStatuses}
              onChange={(next) => set("introducibleResidenceStatuses", next)}
            />
          </Field>
        </Group>

        {/* 手数料 */}
        <Group title="手数料">
          <Field label="手数料 (目安)">
            <input
              className={INPUT}
              value={form.feeAmount}
              onChange={(e) => set("feeAmount", e.target.value)}
              placeholder="例: 介護WL3万円 / 5万円 / 海外無料、国内有料"
            />
          </Field>
          <Field label="最低金額">
            <input
              className={INPUT}
              value={form.minFeeAmount}
              onChange={(e) => set("minFeeAmount", e.target.value)}
            />
          </Field>
          <Field label="配分比率">
            <input
              className={INPUT}
              value={form.feeShareRatio}
              onChange={(e) => set("feeShareRatio", e.target.value)}
            />
          </Field>
        </Group>

        {/* メモ */}
        <Group title="メモ・特徴">
          <Field label="特徴・強み" className="md:col-span-2">
            <textarea
              className={`${INPUT} min-h-20`}
              value={form.features}
              onChange={(e) => set("features", e.target.value)}
              placeholder="例: 技能実習終了後、特定技能の人材紹介"
            />
          </Field>
          <Field label="メモ" className="md:col-span-2">
            <textarea
              className={`${INPUT} min-h-24`}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </Group>
      </section>

      {/* 評価の推移 */}
      {initial.ratingHistory.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-[var(--color-text-dark)]">評価の推移</h2>
            <p className="text-[11px] text-gray-400">直近 {initial.ratingHistory.length} 件</p>
          </div>
          <ol className="mt-3 space-y-2">
            {initial.ratingHistory.map((h, idx) => (
              <li
                key={h.id}
                className={`relative rounded-xl border px-4 py-3 ${
                  idx === 0
                    ? "border-[var(--color-primary)]/40 bg-[var(--color-light)]/60"
                    : "border-gray-100 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RatingStars value={h.rating} readOnly size={14} />
                    <span className="text-[11px] text-gray-500">
                      {h.rating ?? "—"} / 5
                    </span>
                    {idx === 0 ? (
                      <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                        最新
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {new Date(h.createdAt).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {h.recordedBy ? ` ・ ${h.recordedBy}` : ""}
                  </p>
                </div>
                {h.reason ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{h.reason}</p>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">理由なし</p>
                )}
              </li>
            ))}
          </ol>
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

function LinkStatusDisplay({
  linkStatus,
  lineUserId,
  messengerPsid,
  whatsappId,
}: {
  linkStatus: string;
  lineUserId: string | null;
  messengerPsid: string | null;
  whatsappId: string | null;
}) {
  const ids: { label: string; value: string }[] = [];
  if (lineUserId) ids.push({ label: "LINE", value: lineUserId });
  if (messengerPsid) ids.push({ label: "Messenger", value: messengerPsid });
  if (whatsappId) ids.push({ label: "WhatsApp", value: whatsappId });
  const isLinked = ids.length > 0 || linkStatus === "完了";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isLinked
              ? "bg-[#DCFCE7] text-[#15803D]"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLinked ? "bg-[#15803D]" : "bg-gray-400"
            }`}
          />
          {isLinked ? "完了" : "未"}
        </span>
        {!isLinked ? (
          <Link href="/partners/link" className="text-[11px] text-[var(--color-primary)] hover:underline">
            連絡先紐づけページへ →
          </Link>
        ) : null}
      </div>
      {ids.length > 0 ? (
        <dl className="grid gap-2 text-sm md:grid-cols-3">
          {ids.map((id) => (
            <div key={id.label} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-gray-500">{id.label}</dt>
              <dd className="mt-0.5 font-mono text-[12.5px] text-[var(--color-text-dark)] truncate">{id.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[11px] text-gray-400">
          LINE / Messenger / WhatsApp の ID はまだ紐づけられていません。
        </p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function CheckboxGroup({
  options,
  values,
  onChange,
}: {
  options: readonly string[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = values.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => toggle(opt)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        );
      })}
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
