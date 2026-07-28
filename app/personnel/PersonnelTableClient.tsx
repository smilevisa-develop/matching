"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import {
  DEFAULT_PERSONNEL_COLUMNS,
  MAX_PERSONNEL_COLUMNS,
  PERSONNEL_COLUMN_SECTIONS,
  type PersonnelColumnKey,
} from "@/lib/personnel-columns";
import { calculateAge } from "@/lib/candidate-profile";

type PersonRow = {
  id: number;
  name: string;
  photoUrl: string | null;
  driveFolderUrl: string | null;
  nationality: string;
  residenceStatus: string;
  channel: string;
  partnerName: string | null;
  englishName: string | null;
  phoneNumber: string | null;
  gender: string | null;
  birthDate: string | null;
  postalCode: string | null;
  address: string | null;
  spouseStatus: string | null;
  childrenCount: string | null;
  motivation: string | null;
  selfIntroduction: string | null;
  japanPurpose: string | null;
  currentJob: string | null;
  retirementReason: string | null;
  preferenceNote: string | null;
  visaExpiryDate: string | null;
  japaneseLevel: string | null;
  japaneseLevelDate: string | null;
  japaneseCheckLevel: string | null;
  licenseName: string | null;
  licenseExpiryDate: string | null;
  otherQualificationName: string | null;
  otherQualificationExpiryDate: string | null;
  traineeExperience: string | null;
  highSchoolName: string | null;
  highSchoolStartDate: string | null;
  highSchoolEndDate: string | null;
  universityName: string | null;
  universityStartDate: string | null;
  universityEndDate: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  LINE: "LINE",
  Messenger: "Messenger",
  mail: "メール",
  WhatsApp: "WhatsApp",
};

export default function PersonnelTableClient({
  persons,
  headerExtras,
}: {
  persons: PersonRow[];
  headerExtras?: ReactNode;
}) {
  const [selectedColumns, setSelectedColumns] = useState<PersonnelColumnKey[]>(DEFAULT_PERSONNEL_COLUMNS);
  const [draftColumns, setDraftColumns] = useState<PersonnelColumnKey[]>(DEFAULT_PERSONNEL_COLUMNS);
  const [editingColumns, setEditingColumns] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPersons = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter((person) => {
      const haystack = [
        person.name,
        person.englishName,
        person.nationality,
        person.residenceStatus,
        person.partnerName,
        person.address,
        person.phoneNumber,
        person.currentJob,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [persons, searchTerm]);

  const orderedItems = useMemo(
    () => PERSONNEL_COLUMN_SECTIONS.flatMap((section) => section.items),
    []
  );

  const sortByEditOrder = (keys: PersonnelColumnKey[]) => {
    const orderIndex = new Map(orderedItems.map((item, index) => [item.key, index]));
    return [...keys].sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)
    );
  };

  const appliedColumns = useMemo(
    () =>
      sortByEditOrder(selectedColumns).map((key) => ({
        key,
        label: orderedItems.find((item) => item.key === key)?.label ?? key,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedColumns, orderedItems]
  );

  const toggleDraftColumn = (key: PersonnelColumnKey) => {
    setDraftColumns((current) => {
      if (current.includes(key)) return current.filter((column) => column !== key);
      if (current.length >= MAX_PERSONNEL_COLUMNS) return current;
      return [...current, key];
    });
  };

  const applyColumns = () => {
    setSelectedColumns(sortByEditOrder(draftColumns));
    setEditingColumns(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="名前・英語名・国籍・パートナー・住所で検索"
        />
        {searchTerm ? (
          <span className="text-xs text-gray-500">
            {filteredPersons.length} / {persons.length} 件
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraftColumns(selectedColumns);
              setEditingColumns((current) => !current);
            }}
            className="rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
          >
            表示項目を編集
          </button>
          {headerExtras}
        </div>
      </div>

      {editingColumns ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-3">
            {PERSONNEL_COLUMN_SECTIONS.map((section) => (
              <div key={section.id} className="rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">{section.label}</p>
                <div className="mt-3 space-y-2">
                  {section.items.map((item) => {
                    const checked = draftColumns.includes(item.key);
                    const disabled = !checked && draftColumns.length >= MAX_PERSONNEL_COLUMNS;
                    return (
                      <label key={item.key} className={`flex items-center gap-3 text-sm ${disabled ? "text-gray-300" : "text-[var(--color-text-dark)]"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleDraftColumn(item.key)}
                          className="accent-[var(--color-primary)]"
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">最大 {MAX_PERSONNEL_COLUMNS} 項目まで表示できます</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditingColumns(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={applyColumns}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
              >
                反映
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-[var(--color-text-dark)]">
              <th className="w-20 px-3 py-3 text-left font-semibold">ID</th>
              {appliedColumns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left font-semibold">
                  {column.label}
                </th>
              ))}
              <th className="w-24 whitespace-nowrap px-3 py-3 text-center font-semibold">保管場所</th>
            </tr>
          </thead>
          <tbody>
            {filteredPersons.map((person) => (
              <tr key={person.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-0 font-mono text-[12.5px] text-[var(--color-primary)]">
                  <Link href={`/personnel/${person.id}/edit`} className="block px-3 py-3">
                    {String(person.id).padStart(4, "0")}
                  </Link>
                </td>
                {appliedColumns.map((column, index) => (
                  <td key={column.key} className="px-4 py-3 text-gray-600">
                    <Link href={`/personnel/${person.id}/edit`} className="block -mx-4 -my-3 px-4 py-3">
                      {renderColumn(person, column.key, index === 0)}
                    </Link>
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <DriveFolderCell
                    personId={person.id}
                    personName={person.name}
                    driveFolderUrl={person.driveFolderUrl}
                  />
                </td>
              </tr>
            ))}
            {persons.length === 0 ? (
              <tr>
                <td colSpan={appliedColumns.length + 2} className="px-4 py-10 text-center text-gray-400">
                  候補者が登録されていません
                </td>
              </tr>
            ) : filteredPersons.length === 0 ? (
              <tr>
                <td colSpan={appliedColumns.length + 2} className="px-4 py-10 text-center text-gray-400">
                  「{searchTerm}」に一致する候補者が見つかりません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderColumn(person: PersonRow, key: PersonnelColumnKey, isFirst: boolean) {
  if (key === "name") {
    return (
      <div className="flex items-center gap-3">
        <PersonAvatar photoUrl={person.photoUrl} name={person.name} size={40} className="rounded-xl" />
        <span className={isFirst ? "font-medium text-[var(--color-text-dark)]" : ""}>{person.name}</span>
      </div>
    );
  }

  const text = getColumnText(person, key);
  if (key === "channel") {
    return (
      <span className="inline-block rounded-full bg-[var(--color-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
        {text}
      </span>
    );
  }
  if (key === "japaneseCheckLevel") {
    if (!person.japaneseCheckLevel) return <span className="text-gray-300">-</span>;
    const s = japaneseCheckBadgeStyle(person.japaneseCheckLevel);
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: s.bg, color: s.text }}
      >
        {person.japaneseCheckLevel}
      </span>
    );
  }
  return text;
}

/** 日本語チェック(AI) 推定レベルのバッジ色 */
function japaneseCheckBadgeStyle(level: string): { bg: string; text: string } {
  if (/N1|N2/.test(level)) return { bg: "#DCFCE7", text: "#15803D" };
  if (/N3/.test(level)) return { bg: "#DBEAFE", text: "#1D4ED8" };
  if (/N4/.test(level)) return { bg: "#FEF3C7", text: "#B45309" };
  return { bg: "#F3F4F6", text: "#6B7280" };
}

function getColumnText(person: PersonRow, key: PersonnelColumnKey) {
  switch (key) {
    case "englishName":
      return person.englishName ?? "-";
    case "nationality":
      return person.nationality;
    case "channel":
      return CHANNEL_LABEL[person.channel] ?? person.channel;
    case "residenceStatus":
      return person.residenceStatus;
    case "partner":
      return person.partnerName ?? "未設定";
    case "phoneNumber":
      return person.phoneNumber ?? "-";
    case "gender":
      return person.gender ?? "-";
    case "birthDate":
      return person.birthDate ?? "-";
    case "age":
      return calculateAge(person.birthDate) || "-";
    case "postalCode":
      return person.postalCode ?? "-";
    case "address":
      return person.address ?? "-";
    case "spouseStatus":
      return person.spouseStatus ?? "-";
    case "childrenCount":
      return person.childrenCount ?? "-";
    case "motivation":
      return person.motivation ?? "-";
    case "selfIntroduction":
      return person.selfIntroduction ?? "-";
    case "japanPurpose":
      return person.japanPurpose ?? "-";
    case "currentJob":
      return person.currentJob ?? "-";
    case "retirementReason":
      return person.retirementReason ?? "-";
    case "preferenceNote":
      return person.preferenceNote ?? "-";
    case "visaExpiryDate":
      return person.visaExpiryDate ?? "-";
    case "japaneseLevel":
      return person.japaneseLevel ?? "-";
    case "japaneseLevelDate":
      return person.japaneseLevelDate ?? "-";
    case "japaneseCheckLevel":
      return person.japaneseCheckLevel ?? "-";
    case "licenseName":
      return person.licenseName ?? "-";
    case "licenseExpiryDate":
      return person.licenseExpiryDate ?? "-";
    case "otherQualificationName":
      return person.otherQualificationName ?? "-";
    case "otherQualificationExpiryDate":
      return person.otherQualificationExpiryDate ?? "-";
    case "traineeExperience":
      return person.traineeExperience ?? "-";
    case "highSchoolName":
      return person.highSchoolName ?? "-";
    case "highSchoolPeriod":
      return [person.highSchoolStartDate, person.highSchoolEndDate].filter(Boolean).join(" 〜 ") || "-";
    case "universityName":
      return person.universityName ?? "-";
    case "universityPeriod":
      return [person.universityStartDate, person.universityEndDate].filter(Boolean).join(" 〜 ") || "-";
    default:
      return person.name;
  }
}

function DriveFolderCell({
  personId,
  personName,
  driveFolderUrl,
}: {
  personId: number;
  personName: string;
  driveFolderUrl: string | null;
}) {
  const [url, setUrl] = useState(driveFolderUrl);

  const assignUrl = async () => {
    const input = prompt(`「${personName}」の保管場所 URL を入力してください`, url ?? "https://drive.google.com/drive/folders/");
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/personnel/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFolderUrl: trimmed }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      alert(result.error || "保管場所の登録に失敗しました");
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-secondary)] bg-[var(--color-light)] text-[var(--color-primary)] hover:bg-white"
        onClick={(event) => event.stopPropagation()}
        title="保管場所を開く (右クリックで URL を変更)"
        onContextMenu={(event) => {
          event.preventDefault();
          void assignUrl();
        }}
      >
        <FolderIcon />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void assignUrl()}
      title="保管場所 URL を設定"
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
