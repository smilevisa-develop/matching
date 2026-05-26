"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CHANNELS } from "@/lib/candidate-profile";
import { RELATIONSHIP_STATUSES, parseCsv } from "@/lib/partner-profile";
import RatingStars from "./RatingStars";

export type PartnerRow = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  linkStatus: string;
  contactName: string | null;
  rating: number | null;
  role: string | null;
  hasPerformance: boolean;
  relationshipStatus: string | null;
  introducibleNationalities: string | null;
  dealCount: number;
  personCount: number;
};

export default function SharedPartnersClient({
  initialPartners,
}: {
  initialPartners: PartnerRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [relFilter, setRelFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return initialPartners.filter((p) => {
      if (relFilter !== "all" && (p.relationshipStatus ?? "") !== relFilter) return false;
      if (!q) return true;
      const haystack = [
        p.name,
        p.country,
        p.contactName,
        channelLabel(p.channel),
        p.role,
        p.relationshipStatus,
        p.introducibleNationalities,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initialPartners, searchTerm, relFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="名前・国・担当・国籍で検索" />
          <FilterTab label="すべて" active={relFilter === "all"} onClick={() => setRelFilter("all")} />
          {RELATIONSHIP_STATUSES.map((r) => (
            <FilterTab
              key={r}
              label={r}
              active={relFilter === r}
              onClick={() => setRelFilter(r)}
            />
          ))}
          <FilterTab
            label="未設定"
            active={relFilter === ""}
            onClick={() => setRelFilter("")}
          />
        </div>
        <span className="text-xs text-gray-500">
          {searchTerm || relFilter !== "all"
            ? `${filtered.length} / ${initialPartners.length} 件`
            : `${initialPartners.length} 件`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
              <th className="px-4 py-3 text-left font-semibold w-16">ID</th>
              <th className="px-4 py-3 text-left font-semibold">パートナー名</th>
              <th className="px-4 py-3 text-left font-semibold w-24">国</th>
              <th className="px-4 py-3 text-left font-semibold w-24">役割</th>
              <th className="px-4 py-3 text-left font-semibold w-24">関係性</th>
              <th className="px-4 py-3 text-left font-semibold">紹介可能国籍</th>
              <th className="px-4 py-3 text-left font-semibold w-32">評価</th>
              <th className="px-4 py-3 text-right font-semibold w-24">実績 (案件)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-0 font-mono text-[13px] text-[var(--color-primary)]">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    #{p.id}
                  </Link>
                </td>
                <td className="p-0 font-medium text-[var(--color-text-dark)]">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    {p.name}
                    {p.contactName ? (
                      <span className="ml-2 text-[11px] font-normal text-gray-400">({p.contactName})</span>
                    ) : null}
                  </Link>
                </td>
                <td className="p-0 text-gray-600">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    {p.country ?? "-"}
                  </Link>
                </td>
                <td className="p-0 text-gray-600">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    {p.role ?? "-"}
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    <RelationshipBadge status={p.relationshipStatus} />
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={`/partners/${p.id}`} className="flex flex-wrap items-center gap-1 px-4 py-3">
                    {parseCsv(p.introducibleNationalities).length === 0 ? (
                      <span className="text-xs text-gray-300">未設定</span>
                    ) : (
                      parseCsv(p.introducibleNationalities).slice(0, 5).map((n) => (
                        <span
                          key={n}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                        >
                          {n}
                        </span>
                      ))
                    )}
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={`/partners/${p.id}`} className="flex items-center px-4 py-3">
                    {p.rating ? (
                      <RatingStars value={p.rating} readOnly size={14} />
                    ) : (
                      <span className="text-xs text-gray-300">未評価</span>
                    )}
                  </Link>
                </td>
                <td className="p-0 text-right text-gray-600">
                  <Link href={`/partners/${p.id}`} className="block px-4 py-3">
                    {p.dealCount} 件
                    {p.personCount > 0 ? (
                      <span className="ml-1 text-[10px] text-gray-400">/ 候補者 {p.personCount}</span>
                    ) : null}
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  {searchTerm || relFilter !== "all"
                    ? "条件に一致するパートナーが見つかりません"
                    : "まだパートナー情報が登録されていません"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelationshipBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-300">未設定</span>;
  // 色分け: 優良=深緑, 実績有り=緑, 実績無し=オレンジ, 通常=グレー, それ以外=グレー
  const style =
    status === "優良"
      ? "bg-[#2E5E4E] text-white"
      : status === "実績有り"
        ? "bg-[#DCFCE7] text-[#166534]"
        : status === "実績無し"
          ? "bg-[#FEF3C7] text-[#92400E]"
          : status === "通常"
            ? "bg-gray-100 text-gray-700"
            : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

function channelLabel(value: string | null) {
  if (!value) return null;
  return CHANNELS.find((c) => c.value === value)?.label ?? value;
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-[240px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "検索..."}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
