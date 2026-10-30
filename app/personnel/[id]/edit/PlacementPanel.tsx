"use client";

import Link from "next/link";
import { useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";
import { APPLICATION_TYPES } from "@/lib/onboarding-flow";

export type PlacementData = {
  acceptedAt: string | null;
  preInterviewAt: string | null;
  companyInterviewAt: string | null;
  offerAt: string | null;
  offerAcceptedAt: string | null;
  applicationPlannedAt: string | null;
  applicationAt: string | null;
  applicationResultAt: string | null;
  applicationType: string | null;
  applicantName: string | null;
  returnHomeFlag: string | null;
  returnHomeAt: string | null;
  entryPlannedAt: string | null;
  entryAt: string | null;
  joinPlannedAt: string | null;
  joinAt: string | null;
  sixMonthStatus: string | null;
  consultation: string | null;
  currentAction: string | null;
};

export type InvoiceData = {
  id: number;
  dealId: number | null;
  unitPrice: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string;
  invoiceUrl: string | null;
  channel: string;
  partnerId: number | null;
  partnerName: string | null;
  costAmount: string | null;
  paInvoiceUrl: string | null;
  paPaid: boolean;
  paPaidAt: string | null;
  notes: string | null;
  dealTitle: string | null;
  companyName: string | null;
};

export default function PlacementPanel({
  personId,
  personName,
  initialPlacement,
  initialInvoices,
  partners,
  deals,
  kanbanDates,
  cardId,
  demo = false,
}: {
  /** お試し (仮のデータ)。保存しない・請求の欄は出さない */
  demo?: boolean;
  personId: number;
  personName: string;
  initialPlacement: PlacementData;
  /** カンバンで動かしたときの日付 (空の段階の候補) */
  kanbanDates: Partial<Record<string, string>>;
  /** 内定者管理のカード (無ければ null) */
  cardId: number | null;
  initialInvoices: InvoiceData[];
  partners: { id: number; name: string }[];
  deals: { id: number; title: string; companyName: string }[];
}) {
  const [placement, setPlacement] = useState<PlacementData>(initialPlacement);
  const [invoices, setInvoices] = useState<InvoiceData[]>(initialInvoices);

  const persist = async (patch: Partial<PlacementData>) => {
    if (demo) return true;
    const res = await fetch(`/api/personnel/${personId}/placement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  };

  /** 段階の日付 (と申請種別・申請者) を保存する */
  const saveStage = async (patch: Partial<PlacementData>) => {
    const before = placement;
    setPlacement((prev) => ({ ...prev, ...patch }));
    if (!(await persist(patch))) {
      setPlacement(before);
      alert("保存に失敗しました");
      return;
    }
    // 内定承諾・申請を入れると内定者管理にカードができるので、読み直す
    if (!demo && !cardId && (patch.offerAcceptedAt || patch.applicationPlannedAt || patch.applicationAt || patch.applicationResultAt)) {
      window.location.reload();
    }
  };

  const addInvoice = async () => {
    const response = await fetch(`/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    const result = await response.json();
    if (result.ok) {
      setInvoices((prev) => [
        ...prev,
        {
          id: result.invoice.id,
          dealId: null,
          unitPrice: null,
          invoiceDate: null,
          invoiceAmount: null,
          invoiceNumber: null,
          invoiceStatus: result.invoice.invoiceStatus,
          invoiceUrl: null,
          channel: result.invoice.channel,
          partnerId: null,
          partnerName: null,
          costAmount: null,
          paInvoiceUrl: null,
          paPaid: false,
          paPaidAt: null,
          notes: null,
          dealTitle: null,
          companyName: null,
        },
      ]);
    }
  };

  const patchInvoice = async (invoiceId: number, patch: Partial<InvoiceData>) => {
    const previous = invoices;
    setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, ...patch } : inv)));
    const response = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!result.ok) {
      setInvoices(previous);
    }
  };

  const deleteInvoice = async (invoiceId: number) => {
    if (!confirm("この請求情報を削除しますか？")) return;
    await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
  };

  // 対応タスクの自動抽出
  const tasks: { id: string; label: string; tone: "alert" | "warn" | "info" }[] = [];
  for (const invoice of invoices) {
    if (invoice.invoiceStatus !== "送付済み" && invoice.invoiceStatus !== "入金済み") {
      tasks.push({
        id: `invoice-send-${invoice.id}`,
        label: `${invoice.companyName ?? "企業"} への請求書送付 (${invoice.invoiceAmount ? `${invoice.invoiceAmount}円` : "金額未設定"})`,
        tone: "alert",
      });
    }
    if (invoice.channel === "PA" && invoice.paPaid === false && invoice.costAmount) {
      tasks.push({
        id: `pa-pay-${invoice.id}`,
        label: `${invoice.partnerName ?? "PA"} へ仕入支払い (${invoice.costAmount}円)`,
        tone: "warn",
      });
    }
  }
  if (placement.offerAt && !placement.offerAcceptedAt) {
    tasks.push({ id: "offer-accepted", label: "内定承諾の確認が未完了", tone: "warn" });
  }
  if (placement.offerAcceptedAt && !placement.applicationAt) {
    tasks.push({ id: "application", label: "在留資格変更申請がまだ", tone: "info" });
  }
  if (placement.applicationAt && !placement.applicationResultAt) {
    tasks.push({ id: "app-result", label: "申請結果の受け取りがまだ", tone: "info" });
  }

  return (
    <div className="space-y-5">
      {tasks.length > 0 ? (
        <section className="rounded-3xl border border-[#FDE68A] bg-[#FFFBEB] p-5">
          <p className="text-sm font-semibold text-[#92400E]">対応が必要なタスク（{tasks.length}件）</p>
          <ul className="mt-3 space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`rounded-2xl px-4 py-2 text-sm ${
                  task.tone === "alert"
                    ? "bg-[#FEE2E2] text-[#B91C1C]"
                    : task.tone === "warn"
                      ? "bg-[#FEF3C7] text-[#92400E]"
                      : "bg-[#DBEAFE] text-[#1D4ED8]"
                }`}
              >
                {task.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-dark)]">進捗 / 日程</h3>
          <p className="mt-1 text-xs text-gray-500">列を押す (カードを動かす) と、その日付を入れます。すべての段階に日付を入れてください。</p>
        </div>
        <StageTrack personName={personName} placement={placement} kanbanDates={kanbanDates} onSave={saveStage} />
        <AfterReturnSummary placement={placement} cardId={demo ? null : cardId} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextareaField
            label="6か月後の状況"
            value={placement.sixMonthStatus ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, sixMonthStatus: v }))}
            onBlur={(v) => void persist({ sixMonthStatus: v || null })}
          />
          <TextareaField
            label="相談したいこと"
            value={placement.consultation ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, consultation: v }))}
            onBlur={(v) => void persist({ consultation: v || null })}
          />
          <TextareaField
            label="現在の対応内容"
            value={placement.currentAction ?? ""}
            onChange={(v) => setPlacement((p) => ({ ...p, currentAction: v }))}
            onBlur={(v) => void persist({ currentAction: v || null })}
            className="md:col-span-2"
          />
        </div>
      </section>

      {demo ? null : (
      <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">請求</h3>
            <p className="mt-1 text-xs text-gray-500">内定先企業への請求と、PA（パートナー）経由の仕入を管理します。</p>
          </div>
          <button
            type="button"
            onClick={() => void addInvoice()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            + 請求を追加
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            まだ請求情報はありません
          </p>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                    {invoice.dealTitle ?? "求人未設定"}
                    {invoice.companyName ? <span className="ml-2 text-xs text-gray-500">({invoice.companyName})</span> : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => void deleteInvoice(invoice.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <SelectField
                    label="求人"
                    value={invoice.dealId ? String(invoice.dealId) : ""}
                    onChange={(v) => void patchInvoice(invoice.id, { dealId: v ? Number(v) : null })}
                  >
                    <option value="">未設定</option>
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title} / {deal.companyName}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="単価（円）"
                    value={invoice.unitPrice ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, unitPrice: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { unitPrice: v || null })}
                  />
                  <TextField
                    label="請求金額"
                    value={invoice.invoiceAmount ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceAmount: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceAmount: v || null })}
                  />
                  <DateField
                    label="請求日"
                    value={invoice.invoiceDate}
                    onChange={(v) => void patchInvoice(invoice.id, { invoiceDate: v || null })}
                  />
                  <TextField
                    label="請求書番号"
                    value={invoice.invoiceNumber ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceNumber: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceNumber: v || null })}
                  />
                  <SelectField
                    label="請求ステータス"
                    value={invoice.invoiceStatus}
                    onChange={(v) => void patchInvoice(invoice.id, { invoiceStatus: v })}
                  >
                    <option value="未送付">未送付</option>
                    <option value="送付済み">送付済み</option>
                    <option value="入金済み">入金済み</option>
                    <option value="保留">保留</option>
                  </SelectField>
                  <TextField
                    label="請求書リンク"
                    value={invoice.invoiceUrl ?? ""}
                    onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, invoiceUrl: v } : i)))}
                    onBlur={(v) => void patchInvoice(invoice.id, { invoiceUrl: v || null })}
                    placeholder="https://..."
                  />
                  <SelectField
                    label="自社 or PA"
                    value={invoice.channel}
                    onChange={(v) => void patchInvoice(invoice.id, { channel: v })}
                  >
                    <option value="自社">自社</option>
                    <option value="PA">PA</option>
                  </SelectField>
                  {invoice.channel === "PA" ? (
                    <div>
                      <label className="text-xs font-medium text-gray-600">パートナー</label>
                      <div className="mt-1">
                        <SearchableSelect
                          items={partners}
                          value={invoice.partnerId ? String(invoice.partnerId) : ""}
                          onChange={(v) => void patchInvoice(invoice.id, { partnerId: v ? Number(v) : null })}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                {invoice.channel === "PA" ? (
                  <div className="mt-3 grid gap-3 rounded-xl bg-white p-3 md:grid-cols-2 lg:grid-cols-4">
                    <TextField
                      label="仕入高"
                      value={invoice.costAmount ?? ""}
                      onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, costAmount: v } : i)))}
                      onBlur={(v) => void patchInvoice(invoice.id, { costAmount: v || null })}
                    />
                    <TextField
                      label="PAからの請求書リンク"
                      value={invoice.paInvoiceUrl ?? ""}
                      onChange={(v) => setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, paInvoiceUrl: v } : i)))}
                      onBlur={(v) => void patchInvoice(invoice.id, { paInvoiceUrl: v || null })}
                    />
                    <label className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={invoice.paPaid}
                        onChange={(e) => void patchInvoice(invoice.id, { paPaid: e.target.checked })}
                        className="accent-[var(--color-primary)]"
                      />
                      <span className="text-xs text-[var(--color-text-dark)]">PAへの支払い完了</span>
                    </label>
                    <DateField
                      label="支払日"
                      value={invoice.paPaidAt}
                      onChange={(v) => void patchInvoice(invoice.id, { paPaidAt: v || null })}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

export type StageField =
  | "acceptedAt"
  | "preInterviewAt"
  | "companyInterviewAt"
  | "offerAt"
  | "offerAcceptedAt"
  | "applicationPlannedAt"
  | "applicationAt"
  | "applicationResultAt";

/** 内定承諾より前〜申請結果までの段階 (一時帰国より後は内定者管理で入れる) */
export const STAGES: { field: StageField; label: string }[] = [
  { field: "acceptedAt", label: "求人受付" },
  { field: "preInterviewAt", label: "事前面談" },
  { field: "companyInterviewAt", label: "企業面談" },
  { field: "offerAt", label: "内定" },
  { field: "offerAcceptedAt", label: "内定承諾" },
  { field: "applicationPlannedAt", label: "申請予定" },
  { field: "applicationAt", label: "申請" },
  { field: "applicationResultAt", label: "申請結果日" },
];

/** カンバンの日付のうち、後ろの段階の日付より後になっていないものだけ候補にする (順番が合わない日付は入れさせない) */
export function usableHints(placement: PlacementData, kanbanDates: Partial<Record<string, string>>) {
  const out: Partial<Record<string, string>> = {};
  STAGES.forEach((st, i) => {
    const hint = kanbanDates[st.field];
    if (hint && STAGES.slice(i + 1).every((later) => !placement[later.field] || placement[later.field]!.slice(0, 10) >= hint)) out[st.field] = hint;
  });
  return out;
}

export const slash = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).replaceAll("-", "/") : "");
const todayYmd = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 進捗をカンバンの形で出す (内定者管理と同じ見た目)。カードは日付が入っている一番後ろの段階に置く。
 * 列を押す・カードを列に落とすと、その段階の日付を入れるポップが出る。
 */
function StageTrack({
  personName,
  placement,
  kanbanDates,
  onSave,
}: {
  personName: string;
  placement: PlacementData;
  kanbanDates: Partial<Record<string, string>>;
  onSave: (patch: Partial<PlacementData>) => Promise<void>;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const current = STAGES.reduce((last, st, i) => (placement[st.field] ? i : last), -1);
  const hints = usableHints(placement, kanbanDates);
  const cardAt = Math.max(current, 0);

  return (
    <>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[900px] grid-cols-8 gap-2">
          {STAGES.map((st, i) => {
            const date = placement[st.field];
            const missing = !date && i < current;
            const hint = date ? undefined : hints[st.field];
            return (
              <div
                key={st.field}
                role="button"
                tabIndex={0}
                onClick={() => setTarget(i)}
                onKeyDown={(e) => e.key === "Enter" && setTarget(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(i);
                }}
                onDragLeave={() => setOver((v) => (v === i ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  if (i !== cardAt || !date) setTarget(i);
                }}
                title={`${st.label}の日付を入れる`}
                className={`flex min-h-28 cursor-pointer flex-col rounded-xl border p-2 transition-colors hover:border-[var(--color-primary)] ${
                  over === i
                    ? "border-[var(--color-primary)] bg-[var(--color-light)]"
                    : missing
                      ? "border-amber-300 bg-amber-50"
                      : i === cardAt && date
                        ? "border-[var(--color-primary)]/40 bg-[var(--color-light)]"
                        : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className="text-xs font-semibold text-gray-600">{st.label}</span>
                <span className={`mt-1 text-xs tabular-nums ${date ? "text-gray-800" : missing ? "font-semibold text-amber-700" : "text-gray-400"}`}>
                  {date ? slash(date) : missing ? "日付が未入力" : hint ? `カンバン ${slash(hint)}` : "—"}
                </span>
                {i === cardAt ? (
                  <span
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", "placement")}
                    className="mt-auto cursor-grab truncate rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-[var(--color-text-dark)] shadow-sm"
                  >
                    {personName}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {target !== null ? (
        <StageDateModal
          index={target}
          placement={placement}
          kanbanDates={hints}
          onClose={() => setTarget(null)}
          onSave={async (patch) => {
            setTarget(null);
            await onSave(patch);
          }}
        />
      ) : null}
    </>
  );
}

/** 段階の日付を入れるポップ。前の段階で日付が空のものも一緒に入れる (すべて埋める) */
export function StageDateModal({
  index,
  placement,
  kanbanDates,
  onClose,
  onSave,
}: {
  index: number;
  placement: PlacementData;
  kanbanDates: Partial<Record<string, string>>;
  onClose: () => void;
  onSave: (patch: Partial<PlacementData>) => Promise<void>;
}) {
  const stage = STAGES[index];
  const existing = placement[stage.field];
  const skipped = STAGES.slice(0, index).filter((st) => !placement[st.field]);
  const isApplication = stage.field === "applicationAt";
  // 今のカードより後の段階に進めるときだけ「今日」を最初に入れる (前の段階は実際の日付を入れてもらう)
  const current = STAGES.reduce((last, st, i) => (placement[st.field] ? i : last), -1);
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...skipped, stage].map((st) => [st.field, placement[st.field]?.slice(0, 10) || kanbanDates[st.field] || (st === stage && index > current ? todayYmd() : "")]),
    ),
  );
  const [applicationType, setApplicationType] = useState(placement.applicationType ?? "");
  const [applicantName, setApplicantName] = useState(placement.applicantName ?? "");
  const [saving, setSaving] = useState(false);

  const complete =
    [...skipped, stage].every((st) => /^\d{4}-\d{2}-\d{2}$/.test(dates[st.field] ?? "")) &&
    (!isApplication || (applicationType.trim() && applicantName.trim()));

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    const patch: Partial<PlacementData> = Object.fromEntries([...skipped, stage].map((st) => [st.field, dates[st.field]]));
    if (isApplication) {
      patch.applicationType = applicationType.trim();
      patch.applicantName = applicantName.trim();
    }
    await onSave(patch);
  };

  const input = (st: (typeof STAGES)[number]) => (
    <label key={st.field} className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{st.label}の日付</span>
      <input
        type="date"
        value={dates[st.field] ?? ""}
        onChange={(e) => setDates((d) => ({ ...d, [st.field]: e.target.value }))}
        className={INPUT}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">「{stage.label}」の日付</p>
        {input(stage)}
        {isApplication ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">申請種別</span>
              <select value={applicationType} onChange={(e) => setApplicationType(e.target.value)} className={INPUT}>
                <option value="">選んでください</option>
                {APPLICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {applicationType && !(APPLICATION_TYPES as readonly string[]).includes(applicationType) ? (
                  <option value={applicationType}>{applicationType}</option>
                ) : null}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">申請者</span>
              <input value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className={INPUT} />
            </label>
          </>
        ) : null}
        {skipped.length > 0 ? (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3">
            <p className="text-xs text-amber-800">前の段階に日付が入っていません。一緒に入れてください。</p>
            {skipped.map(input)}
          </div>
        ) : null}
        {stage.field === "offerAcceptedAt" ? (
          <p className="text-xs text-gray-500">内定承諾を入れると、内定者管理にカードができます (担当: グェット)。</p>
        ) : null}
        <div className="flex items-center gap-2 pt-1">
          {existing ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void onSave({ [stage.field]: null });
              }}
              className="text-xs text-red-500 hover:underline disabled:opacity-50"
            >
              日付を消す
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
            キャンセル
          </button>
          <button
            type="button"
            disabled={!complete || saving}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 一時帰国より後 (内定者管理のカードで、内定者管理の担当が入れる)。ここでは見るだけ */
export function AfterReturnSummary({ placement, cardId }: { placement: PlacementData; cardId: number | null }) {
  const items: [string, string][] = [
    ["一時帰国日", slash(placement.returnHomeAt)],
    ["入国日", slash(placement.entryAt)],
    ["入社予定日", slash(placement.joinPlannedAt)],
    ["入社日", slash(placement.joinAt)],
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600">一時帰国・入国・入社 (内定者管理で入力)</p>
        {cardId ? (
          <Link href={`/onboarding?open=${cardId}`} className="text-xs text-[var(--color-primary)] underline">
            内定者管理で開く
          </Link>
        ) : (
          <span className="text-xs text-gray-400">内定承諾を入れると内定者管理にカードができます</span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-gray-500">{label}</dt>
            <dd className={`text-sm tabular-nums ${value ? "text-gray-800" : "text-gray-300"}`}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  onBlur,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        className={`${INPUT} min-h-20`}
        rows={3}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {children}
      </select>
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";
