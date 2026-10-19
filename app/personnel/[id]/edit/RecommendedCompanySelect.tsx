"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";

export type CompanyLink = { companyId: number; dealId: number; stage: string };

/** 1 人の候補者を同時に入れておける推薦先企業の上限 (A 社で不採用でも別の企業に推薦できるように) */
export const MAX_RECOMMENDED_COMPANIES = 5;

/**
 * 推薦先企業 (候補者詳細ヘッダー)。最大 5 社まで。
 *
 * 選んだ企業のカンバンに候補者を入れる。× で外すと、その企業のカンバンからも外れる。
 * 企業詳細・進捗管理のカンバンと同じデータなので、どこから見ても同じ状態になる。
 * 横には、その企業のカンバンでの今のステータスを出す。
 */
export default function RecommendedCompanySelect({
  personId,
  companies,
  initialLinks,
  legacyValue,
}: {
  personId: number;
  /** 選択肢 (label は「企業ID_企業名」) */
  companies: { id: number; label: string }[];
  /** 今カンバンに入っている企業 (新しい順) */
  initialLinks: CompanyLink[];
  /** 以前の手入力の推薦先 (カンバンに紐づいていないときだけ表示する) */
  legacyValue: string | null;
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const labelOf = (companyId: number) => companies.find((c) => c.id === companyId)?.label ?? "";

  const save = async (companyId: number | null, removeCompanyId: number | null) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/personnel/${personId}/recommended-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, removeCompanyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "保存に失敗しました");
        return;
      }
      setLinks(data.links as CompanyLink[]);
      setAdding(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = (link: CompanyLink) => {
    const ok = window.confirm(
      `「${labelOf(link.companyId)}」のカンバンから外します（今のステータス: ${link.stage}）。` +
        (link.stage !== "接続済み" ? "\nこのカードで数えた推薦・面接・内定などの人数も戻ります。" : "") +
        "\nよろしいですか？",
    );
    if (ok) void save(null, link.companyId);
  };

  const canAdd = links.length < MAX_RECOMMENDED_COMPANIES;
  const addable = companies.filter((c) => !links.some((l) => l.companyId === c.id));
  const showSelect = links.length === 0 || adding;

  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-medium text-gray-500">
        推薦先企業
        {links.length > 0 ? <span className="ml-1 text-gray-400">{links.length}/{MAX_RECOMMENDED_COMPANIES} 社</span> : null}
      </label>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {links.map((link) => (
          <span
            key={link.companyId}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-white pl-2.5 pr-1 py-0.5 text-xs text-[var(--color-text-dark)]"
          >
            <span className="truncate">{labelOf(link.companyId) || `企業 ${link.companyId}`}</span>
            <Link
              href={`/companies/deals/${link.dealId}`}
              className="shrink-0 rounded-full bg-[var(--color-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
              title="企業のカンバンを開く"
            >
              {link.stage}
            </Link>
            <button
              type="button"
              onClick={() => remove(link)}
              disabled={saving}
              aria-label="この企業から外す"
              title="この企業から外す"
              className="shrink-0 rounded-full px-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              ✕
            </button>
          </span>
        ))}
        {showSelect && canAdd ? (
          <div className="w-[240px] max-w-full">
            <SearchableSelect
              items={addable.map((c) => ({ id: String(c.id), name: c.label }))}
              value=""
              onChange={(v) => {
                if (v) void save(Number(v), null);
              }}
              placeholder={legacyValue && links.length === 0 ? `${legacyValue}（カンバン未登録）` : "企業を選択"}
              emptyValueLabel="未設定"
              searchPlaceholder="企業名で検索…"
            />
          </div>
        ) : null}
        {!showSelect && canAdd ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={saving}
            className="rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-gray-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40"
          >
            + 企業を追加
          </button>
        ) : null}
        {saving ? <span className="text-[11px] text-gray-400">保存中…</span> : null}
      </div>
    </div>
  );
}
