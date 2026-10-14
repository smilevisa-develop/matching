"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CompanyRow = {
  id: number;
  externalId: string | null;
  name: string;
  industry: string | null;
  hiringStatus: string;
  driveFolderUrl: string | null;
};

export default function CompaniesListClient({
  active,
  stopped,
}: {
  active: CompanyRow[];
  stopped: CompanyRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filter = (list: CompanyRow[]) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter((company) => {
      const haystack = [company.externalId, company.name, company.industry, company.hiringStatus]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  };

  const filteredActive = useMemo(() => filter(active), [active, searchTerm]);
  const filteredStopped = useMemo(() => filter(stopped), [stopped, searchTerm]);
  const total = active.length + stopped.length;
  const filteredTotal = filteredActive.length + filteredStopped.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="企業ID・企業名・業種で検索"
        />
        {searchTerm ? (
          <span className="text-xs text-gray-500">
            {filteredTotal} / {total} 件
          </span>
        ) : null}
      </div>

      <CompaniesTable
        companies={filteredActive}
        emptyLabel={searchTerm ? `「${searchTerm}」に一致する企業が見つかりません` : "まだ企業情報が登録されていません"}
      />

      {stopped.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 pt-2">
            <h2 className="text-sm font-semibold text-gray-500">ストップ・成約</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
              {filteredStopped.length}{searchTerm ? ` / ${stopped.length}` : ""} 件
            </span>
          </div>
          <CompaniesTable
            companies={filteredStopped}
            emptyLabel={searchTerm ? `「${searchTerm}」に一致する企業はありません` : "ストップ・成約の企業はありません"}
            muted
          />
        </div>
      ) : null}
    </div>
  );
}

function CompaniesTable({
  companies,
  emptyLabel,
  muted = false,
}: {
  companies: CompanyRow[];
  emptyLabel: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${
        muted ? "opacity-80" : ""
      }`}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
            <th className="px-4 py-3 text-left font-semibold w-28">企業ID</th>
            <th className="px-4 py-3 text-left font-semibold">企業名</th>
            <th className="px-4 py-3 text-left font-semibold">業種</th>
            <th className="px-4 py-3 text-left font-semibold">採用状況</th>
            <th className="w-24 whitespace-nowrap px-3 py-3 text-center font-semibold">保管場所</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="p-0 font-mono text-[13px] text-[var(--color-primary)]">
                <Link href={`/companies/${company.id}`} className="block px-4 py-3">
                  {company.externalId ?? <span className="text-gray-300">未設定</span>}
                </Link>
              </td>
              <td className="p-0 font-medium text-[var(--color-text-dark)]">
                <Link href={`/companies/${company.id}`} className="block px-4 py-3">
                  {company.name}
                </Link>
              </td>
              <td className="p-0 text-gray-600">
                <Link href={`/companies/${company.id}`} className="block px-4 py-3">
                  {company.industry ?? "-"}
                </Link>
              </td>
              <td className="p-0">
                <Link href={`/companies/${company.id}`} className="block px-4 py-3">
                  <span className="inline-block rounded-full bg-[var(--color-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                    {company.hiringStatus}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-center">
                <CompanyDriveCell
                  companyId={company.id}
                  companyName={company.name}
                  driveFolderUrl={company.driveFolderUrl}
                />
              </td>
            </tr>
          ))}
          {companies.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CompanyDriveCell({
  companyId,
  companyName,
  driveFolderUrl,
}: {
  companyId: number;
  companyName: string;
  driveFolderUrl: string | null;
}) {
  const [url, setUrl] = useState(driveFolderUrl);

  const assignUrl = async () => {
    const input = prompt(
      `「${companyName}」の Drive フォルダ URL を入力してください`,
      url ?? "https://drive.google.com/drive/folders/"
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/companies/${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFolderUrl: trimmed }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      alert(result.error || "Drive フォルダの登録に失敗しました");
      return;
    }
    setUrl(trimmed);
  };

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Drive フォルダを開く (右クリックで URL を変更)"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          void assignUrl();
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-secondary)] bg-[var(--color-light)] text-[var(--color-primary)] hover:bg-white"
      >
        <FolderIcon />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void assignUrl()}
      title="Drive フォルダ URL を設定"
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-gray-400 hover:border-[var(--color-secondary)] hover:text-[var(--color-primary)]"
    >
      <FolderIcon />
    </button>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l1.4 1.8c.2.25.5.4.82.4H18.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
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
    <div className="relative w-full max-w-md">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "検索..."}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
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
