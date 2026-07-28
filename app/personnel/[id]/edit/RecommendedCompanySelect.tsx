"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";

/**
 * 推薦先企業の選択 (候補者詳細ヘッダー)。
 *
 * - 企業を選択式で手動設定できる (案件紐づけフローに不慣れでも設定可能)。
 * - 案件 (DealCandidate) に紐づいている場合、そこから導出した企業を表示。
 *   紐づけと違う企業に変えようとしたら確認ダイアログを出す。
 * - 保存すると Person.recommendedCompany に入り、スプシ「推薦先企業」へ優先反映。
 */
export default function RecommendedCompanySelect({
  personId,
  initial,
  companyOptions,
  dealCompanies,
}: {
  personId: number;
  /** 手動上書き値 (空なら未設定) */
  initial: string | null;
  /** 選択肢になる企業名の一覧 */
  companyOptions: string[];
  /** 案件から導出された企業名 (紐づけ済みの企業) */
  dealCompanies: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (next: string) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/personnel/${personId}/recommended-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "保存に失敗しました");
        return false;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
      return true;
    } catch {
      alert("保存に失敗しました");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleChange = async (next: string) => {
    // 案件に紐づいていて、その企業と違うものに変えようとしたら確認
    if (
      next &&
      dealCompanies.length > 0 &&
      !dealCompanies.includes(next)
    ) {
      const ok = window.confirm(
        `この候補者は案件で「${dealCompanies.join("・")}」に紐づいています。\n` +
          `推薦先を「${next}」に変更してよろしいですか？`,
      );
      if (!ok) return; // キャンセル → 変更しない
    }
    setValue(next);
    await save(next);
  };

  // 選択肢: 企業一覧 + (案件由来だが一覧に無い企業も念のため足す)
  const options = Array.from(
    new Set([...companyOptions, ...dealCompanies, ...(initial ? [initial] : [])].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "ja"));

  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-medium text-gray-500">推薦先企業</label>
      <div className="mt-0.5 flex items-center gap-2">
        <div className="max-w-[240px] flex-1">
          <SearchableSelect
            items={options.map((c) => ({ id: c, name: c }))}
            value={value}
            onChange={(v) => void handleChange(v)}
            placeholder="未設定（企業を選択）"
            emptyValueLabel="未設定"
            searchPlaceholder="企業名で検索…"
          />
        </div>
        {saving ? (
          <span className="text-[11px] text-gray-400">保存中…</span>
        ) : saved ? (
          <span className="text-[11px] font-medium text-[#15803D]">保存しました</span>
        ) : null}
      </div>
      {/* 案件から導出された企業 (参考表示) */}
      {dealCompanies.length > 0 ? (
        <p className="mt-1 text-[11px] text-gray-400">
          案件から: {dealCompanies.join("・")}
          {!value ? "（未設定なら自動でこれを反映）" : null}
        </p>
      ) : null}
    </div>
  );
}
