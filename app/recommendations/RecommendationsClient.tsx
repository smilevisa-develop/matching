"use client";

import { useState } from "react";

type Deal = {
  id: number;
  title: string;
  companyName: string;
  candidateCount: number;
};

export default function RecommendationsClient({
  deals,
  lockedDealId,
}: {
  deals: Deal[];
  /** 指定すると案件選択 UI を出さず、このIDで固定 */
  lockedDealId?: number;
}) {
  const [dealId, setDealId] = useState(
    lockedDealId ? String(lockedDealId) : deals[0]?.id ? String(deals[0].id) : ""
  );
  // ステージ複数選択 (デフォルトは全ステージ選択 = 紐付いてる全候補者を出力)
  // 過去は「接続済みのみ」がデフォルトだったが、「5人紐付いているのに1人しか
  //  出力されない」という混乱があったため、全ステージ初期選択に変更。
  //  ユーザーは不要なステージのチップをクリックして外す運用。
  const STAGE_OPTIONS = ["接続済み", "事前面談済み", "推薦済み", "内定済み", "書類NG", "面談NG", "不合格"] as const;
  const [stageFilters, setStageFilters] = useState<string[]>([...STAGE_OPTIONS]);
  const [saving, setSaving] = useState(false);

  const toggleStage = (stage: string) => {
    setStageFilters((current) =>
      current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage]
    );
  };

  const saveToDrive = async () => {
    if (!dealId) {
      alert("案件を選択してください");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/recommendations/save-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: Number(dealId), stages: stageFilters }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "Drive への保存に失敗しました");
        return;
      }
      const openFolder = confirm(
        `推薦リストを保存しました\n企業フォルダを開きますか？`
      );
      if (openFolder && result.folderUrl) {
        window.open(result.folderUrl, "_blank");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-[var(--color-secondary)] bg-white p-6 shadow-sm">
      <div
        className={`grid gap-4 ${
          lockedDealId ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_1fr_auto]"
        }`}
      >
        {!lockedDealId ? (
          <Field label="案件">
            <select className={INPUT} value={dealId} onChange={(e) => setDealId(e.target.value)}>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.companyName} / {deal.title} ({deal.candidateCount}名)
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="対象ステージ (複数選択可)">
          <div className="flex flex-wrap gap-2">
            {STAGE_OPTIONS.map((stage) => {
              const checked = stageFilters.includes(stage);
              return (
                <label
                  key={stage}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                    checked
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={checked}
                    onChange={() => toggleStage(stage)}
                  />
                  {stage}
                </label>
              );
            })}
          </div>
        </Field>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void saveToDrive()}
            disabled={saving}
            className="h-[42px] rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {saving ? "保存中..." : "Drive に保存"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";
