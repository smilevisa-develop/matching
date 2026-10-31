"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useKeptState } from "@/app/components/KeepOnBack";
import { CHANNELS } from "@/lib/candidate-profile";
import { parseCsv } from "@/lib/partner-profile";
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
  isActive: boolean;
};

export default function SharedPartnersClient({
  initialPartners,
}: {
  initialPartners: PartnerRow[];
}) {
  const [searchTerm, setSearchTerm] = useKeptState("search", "");
  const [activeFilter, setActiveFilter] = useKeptState<ActiveFilter>("active", "active");
  const [sort, setSort] = useKeptState<SortState>("sort", { key: "rating", dir: "desc" });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return initialPartners.filter((p) => {
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
  }, [initialPartners, searchTerm]);

  const activeCount = useMemo(() => filtered.filter((p) => p.isActive).length, [filtered]);
  const inactiveCount = filtered.length - activeCount;

  const rows = useMemo(() => {
    const visible =
      activeFilter === "all"
        ? filtered
        : filtered.filter((p) => p.isActive === (activeFilter === "active"));
    return [...visible].sort((a, b) => comparePartners(a, b, sort));
  }, [filtered, activeFilter, sort]);

  const filtering = Boolean(searchTerm);

  const toggleSort = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="名前・国・担当・国籍で検索" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <ActiveToggle
            label={`アクティブ ${activeCount}`}
            active={activeFilter === "active"}
            onClick={() => setActiveFilter("active")}
          />
          <ActiveToggle
            label={`非アクティブ ${inactiveCount}`}
            active={activeFilter === "inactive"}
            onClick={() => setActiveFilter("inactive")}
          />
          <ActiveToggle
            label={`全件 ${filtered.length}`}
            active={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
          />
        </div>
      </div>

      <PartnerTable
        rows={rows}
        sort={sort}
        onSort={toggleSort}
        emptyLabel={
          filtering
            ? "条件に一致するパートナーが見つかりません"
            : activeFilter === "inactive"
              ? "非アクティブなパートナーはいません"
              : "パートナーがまだ登録されていません"
        }
      />
    </div>
  );
}

type ActiveFilter = "active" | "inactive" | "all";
type SortKey = "id" | "name" | "country" | "rating" | "dealCount";
type SortState = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  id: "desc",
  name: "asc",
  country: "asc",
  rating: "desc",
  dealCount: "desc",
};

function comparePartners(a: PartnerRow, b: PartnerRow, sort: SortState) {
  const sign = sort.dir === "asc" ? 1 : -1;
  let diff = 0;
  switch (sort.key) {
    case "id":
      diff = a.id - b.id;
      break;
    case "name":
      diff = a.name.localeCompare(b.name, "ja");
      break;
    case "country":
      // 未設定は昇順・降順どちらでも末尾
      if (!a.country !== !b.country) return a.country ? -1 : 1;
      diff = (a.country ?? "").localeCompare(b.country ?? "", "ja");
      break;
    case "rating":
      // 未評価は昇順・降順どちらでも末尾
      if (!a.rating !== !b.rating) return a.rating ? -1 : 1;
      diff = (a.rating ?? 0) - (b.rating ?? 0);
      break;
    case "dealCount":
      diff = a.dealCount - b.dealCount || a.personCount - b.personCount;
      break;
  }
  if (diff !== 0) return diff * sign;
  // 同順位は 評価 → 実績 → 新しい順
  return (b.rating ?? 0) - (a.rating ?? 0) || b.dealCount - a.dealCount || b.id - a.id;
}

function PartnerTable({
  rows,
  sort,
  onSort,
  emptyLabel,
}: {
  rows: PartnerRow[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  emptyLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
            <SortableTh label="ID" sortKey="id" sort={sort} onSort={onSort} className="w-16" />
            <SortableTh label="パートナー名" sortKey="name" sort={sort} onSort={onSort} />
            <SortableTh label="拠点国" sortKey="country" sort={sort} onSort={onSort} className="w-24" />
            <th className="px-4 py-3 text-left font-semibold w-24">役割</th>
            <th className="px-4 py-3 text-left font-semibold w-28 whitespace-nowrap">関係性</th>
            <th className="px-4 py-3 text-left font-semibold">紹介可能国籍</th>
            <SortableTh label="評価" sortKey="rating" sort={sort} onSort={onSort} className="w-32" />
            <SortableTh
              label="実績 (求人)"
              sortKey="dealCount"
              sort={sort}
              onSort={onSort}
              align="right"
              className="w-32"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={`border-t border-gray-100 hover:bg-gray-50 ${
                p.isActive ? "" : "bg-gray-50 opacity-60"
              }`}
            >
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
                  {p.isActive ? null : (
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      非アクティブ
                    </span>
                  )}
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
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const current = sort.key === sortKey;
  return (
    <th
      className={`p-0 font-semibold whitespace-nowrap ${className}`}
      aria-sort={current ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 px-4 py-3 hover:bg-black/5 ${
          align === "right" ? "justify-end" : "justify-start"
        }`}
      >
        {label}
        <span className={`text-[10px] ${current ? "text-[var(--color-primary)]" : "text-gray-300"}`}>
          {current ? (sort.dir === "asc" ? "▲" : "▼") : "▲▼"}
        </span>
      </button>
    </th>
  );
}

function ActiveToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-[var(--color-primary)] text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

function RelationshipBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-300">未設定</span>;
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
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

function channelLabel(value: string | null) {
  if (!value) return null;
  return CHANNELS.find((c) => c.value === value)?.label ?? value;
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
