"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SearchableSelect from "@/app/components/SearchableSelect";

export type CompanyLink = { companyId: number; dealId: number; stage: string };

/**
 * 推薦先企業 (候補者詳細ヘッダー)。
 *
 * 選んだ企業のカンバンに候補者を入れ、変えたり取り消したりしたら元の企業のカンバンから外す。
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

  const current = links[0] ?? null;
  const labelOf = (companyId: number) => companies.find((c) => c.id === companyId)?.label ?? "";

  const save = async (companyId: number | null) => {
    const removeCompanyId = current?.companyId ?? null;
    if (current && companyId !== current.companyId && current.stage !== "接続済み") {
      const ok = window.confirm(
        `「${labelOf(current.companyId)}」のカンバンから外します（今のステータス: ${current.stage}）。\n` +
          "このカードで数えた推薦・面接・内定などの人数も戻ります。よろしいですか？",
      );
      if (!ok) return;
    }
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
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  // 選んでいる企業を先頭に出すため、他にも紐づいている企業は「ほか N 社」とだけ出す
  const others = links.length - 1;

  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-medium text-gray-500">推薦先企業</label>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <div className="w-[240px] max-w-full">
          <SearchableSelect
            items={companies.map((c) => ({ id: String(c.id), name: c.label }))}
            value={current ? String(current.companyId) : ""}
            onChange={(v) => void save(v ? Number(v) : null)}
            placeholder={legacyValue ? `${legacyValue}（カンバン未登録）` : "未設定（企業を選択）"}
            emptyValueLabel="未設定"
            searchPlaceholder="企業名で検索…"
          />
        </div>
        {saving ? (
          <span className="text-[11px] text-gray-400">保存中…</span>
        ) : current ? (
          <Link
            href={`/companies/deals/${current.dealId}`}
            className="rounded-full bg-[var(--color-light)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
            title="企業のカンバンを開く"
          >
            {current.stage}
          </Link>
        ) : null}
        {!saving && others > 0 ? <span className="text-[11px] text-gray-400">ほか {others} 社</span> : null}
      </div>
    </div>
  );
}
