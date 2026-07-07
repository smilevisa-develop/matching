"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SSW_INDUSTRIES, normalizeSswIndustry } from "@/lib/company-options";
import PersonPicker from "@/app/components/PersonPicker";
import PersonAvatar from "@/app/components/PersonAvatar";
import RecommendationsClient from "@/app/recommendations/RecommendationsClient";
import CloseButton from "@/app/components/CloseButton";

const CANDIDATE_COLUMNS = [
  "接続済み",
  "事前面談済み",
  "推薦済み",
  "内定済み",
  "書類NG",
  "面談NG",
  "不合格",
] as const;

// カンバン各カラムの色分け (見やすさのため緑系のグラデーション + NG / 不合格は赤系)
const COLUMN_COLOR: Record<string, { border: string; head: string; tile: string }> = {
  接続済み: {
    border: "border-[#BFDBFE]",
    head: "bg-[#DBEAFE] text-[#1D4ED8]",
    tile: "bg-[#EFF6FF] border-[#BFDBFE] hover:border-[#60A5FA]",
  },
  事前面談済み: {
    border: "border-[#C7D2FE]",
    head: "bg-[#E0E7FF] text-[#4338CA]",
    tile: "bg-[#EEF2FF] border-[#C7D2FE] hover:border-[#818CF8]",
  },
  推薦済み: {
    border: "border-[#FDE68A]",
    head: "bg-[#FEF3C7] text-[#92400E]",
    tile: "bg-[#FFFBEB] border-[#FDE68A] hover:border-[#F59E0B]",
  },
  内定済み: {
    border: "border-[#BBF7D0]",
    head: "bg-[#DCFCE7] text-[#166534]",
    tile: "bg-[#F0FDF4] border-[#BBF7D0] hover:border-[#22C55E]",
  },
  書類NG: {
    border: "border-[#FED7AA]",
    head: "bg-[#FFEDD5] text-[#9A3412]",
    tile: "bg-[#FFF7ED] border-[#FED7AA] hover:border-[#FB923C]",
  },
  面談NG: {
    border: "border-[#FBCFE8]",
    head: "bg-[#FCE7F3] text-[#9D174D]",
    tile: "bg-[#FDF2F8] border-[#FBCFE8] hover:border-[#EC4899]",
  },
  不合格: {
    border: "border-[#FECACA]",
    head: "bg-[#FEE2E2] text-[#B91C1C]",
    tile: "bg-[#FEF2F2] border-[#FECACA] hover:border-[#EF4444]",
  },
};
const STATUS_OPTIONS = ["至急募集", "募集中", "面接中", "成約", "クローズ"] as const;
const PRIORITY_OPTIONS = [
  { value: "normal", label: "通常" },
  { value: "high", label: "高" },
  { value: "urgent", label: "急ぎ" },
] as const;

type CandidateCard = {
  id: number;
  note: string | null;
  stage: string;
  person: {
    id: number;
    name: string;
    englishName?: string | null;
    nationality: string;
    residenceStatus: string;
    photoUrl: string | null;
    partner: { id: number; name: string } | null;
  };
};

/** 候補者カード見出し用: 「001 DAO VAN HOANG」形式 (英語名がなければカナ名) */
function formatCandidateLabel(person: { id: number; name: string; englishName?: string | null }): string {
  const prefix = String(person.id).padStart(3, "0");
  const label = person.englishName?.trim() || person.name;
  return `${prefix} ${label}`;
}

type DealDetail = {
  id: number;
  title: string;
  field: string | null;
  company: { id: number; name: string };
  owner: { id: number; name: string } | null;
  priority: string;
  status: string;
  unitPrice: string | null;
  deadline: string | null;
  acceptedAt: string | null;
  requiredCount: number;
  recommendedCount: number;
  interviewCount: number;
  offerCount: number;
  contractCount: number;
  declineCount: number;
  rejectCount: number;
  notes: string | null;
  candidates: CandidateCard[];
};

type PersonOption = {
  id: number;
  name: string;
  nationality: string;
  residenceStatus: string;
  photoUrl: string | null;
};

export default function DealDetailClient({
  deal,
  persons,
}: {
  deal: DealDetail;
  persons: PersonOption[];
}) {
  const router = useRouter();
  const [currentDeal, setCurrentDeal] = useState(deal);
  const [candidates, setCandidates] = useState(deal.candidates);
  const [draggingCandidateId, setDraggingCandidateId] = useState<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: deal.title,
    field: normalizeSswIndustry(deal.field) ?? SSW_INDUSTRIES[0],
    priority: deal.priority,
    status: deal.status,
    unitPrice: deal.unitPrice ?? "",
    deadline: deal.deadline ? deal.deadline.slice(0, 10) : "",
    acceptedAt: deal.acceptedAt ? deal.acceptedAt.slice(0, 10) : "",
    notes: deal.notes ?? "",
  });

  const handleDeleteDeal = async () => {
    const candidateCount = candidates.length;
    const warning =
      candidateCount > 0
        ? `この案件には ${candidateCount} 名の候補者が紐づいています。\n削除すると候補者との関連も全て解除されます (候補者本体は残ります)。\n本当に削除しますか?`
        : "この案件を削除します。よろしいですか?";
    if (!confirm(warning)) return;
    const response = await fetch(`/api/deals/${currentDeal.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      alert(result.error || "案件の削除に失敗しました");
      return;
    }
    alert("削除しました");
    router.push(`/companies/${currentDeal.company.id}`);
  };

  const startEdit = () => {
    setEditForm({
      title: currentDeal.title,
      field: normalizeSswIndustry(currentDeal.field) ?? SSW_INDUSTRIES[0],
      priority: currentDeal.priority,
      status: currentDeal.status,
      unitPrice: currentDeal.unitPrice ?? "",
      deadline: currentDeal.deadline ? currentDeal.deadline.slice(0, 10) : "",
      acceptedAt: currentDeal.acceptedAt ? currentDeal.acceptedAt.slice(0, 10) : "",
      notes: currentDeal.notes ?? "",
    });
    setEditing(true);
  };

  const updateCounter = async (
    key: "requiredCount" | "recommendedCount" | "interviewCount" | "offerCount" | "contractCount" | "declineCount" | "rejectCount",
    next: number,
  ) => {
    const clamped = Math.max(0, Math.floor(next));
    const previous = currentDeal[key];
    setCurrentDeal((prev) => ({ ...prev, [key]: clamped }));
    const response = await fetch(`/api/deals/${currentDeal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: clamped }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setCurrentDeal((prev) => ({ ...prev, [key]: previous }));
      alert(result.error || "カウンターの更新に失敗しました");
    }
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) {
      alert("案件名を入力してください");
      return;
    }
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/deals/${currentDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "更新に失敗しました");
        return;
      }
      setCurrentDeal((prev) => ({
        ...prev,
        title: editForm.title,
        field: editForm.field || null,
        priority: editForm.priority,
        status: editForm.status,
        unitPrice: editForm.unitPrice || null,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
        acceptedAt: editForm.acceptedAt ? new Date(editForm.acceptedAt).toISOString() : null,
        notes: editForm.notes || null,
      }));
      setEditing(false);
      router.refresh();
    } finally {
      setSavingEdit(false);
    }
  };

  const addablePersons = useMemo(
    () => persons.filter((person) => !candidates.some((candidate) => candidate.person.id === person.id)),
    [persons, candidates]
  );

  const moveCandidate = async (candidateId: number, nextStage: string) => {
    const currentCandidate = candidates.find((candidate) => candidate.id === candidateId);
    if (!currentCandidate || currentCandidate.stage === nextStage) return;

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, stage: nextStage } : candidate
      )
    );

    const response = await fetch(`/api/deal-candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: nextStage }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      alert(result.error || "候補者ステップの更新に失敗しました");
      setCandidates(deal.candidates);
    }
  };

  const addCandidate = async () => {
    if (!selectedPersonId) {
      alert("候補者を選択してください");
      return;
    }

    setAdding(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: Number(selectedPersonId) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "候補者の追加に失敗しました");
        return;
      }
      setCandidates((current) => [
        {
          id: result.candidate.id,
          note: result.candidate.note,
          stage: result.candidate.stage,
          person: result.candidate.person,
        },
        ...current,
      ]);
      setSelectedPersonId("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--color-text-dark)]">案件情報</h2>
              <span className={statusClass(currentDeal.status)}>{currentDeal.status}</span>
              {currentDeal.priority && currentDeal.priority !== "normal" ? (
                <span className={priorityClass(currentDeal.priority)}>{priorityLabel(currentDeal.priority)}</span>
              ) : null}
            </div>
            {!editing ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <InfoRow label="企業" value={currentDeal.company.name} />
                <InfoRow label="担当者" value={currentDeal.owner?.name ?? "未設定"} />
                <InfoRow label="単価" value={formatUnitPrice(currentDeal.unitPrice)} />
                <InfoRow label="案件受付日" value={currentDeal.acceptedAt ? new Date(currentDeal.acceptedAt).toLocaleDateString("ja-JP") : "未設定"} />
                <InfoRow label="期限" value={currentDeal.deadline ? new Date(currentDeal.deadline).toLocaleDateString("ja-JP") : "未設定"} />
                <InfoRow label="分野" value={normalizeSswIndustry(currentDeal.field) ?? "未設定"} />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Link href={`/companies/${currentDeal.company.id}`} className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
              企業詳細へ戻る
            </Link>
            <button
              type="button"
              onClick={() => setRecommendationOpen(true)}
              className="self-start rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              推薦リスト作成
            </button>
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="self-start rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                編集
              </button>
            ) : null}
            {!editing ? (
              <button
                type="button"
                onClick={handleDeleteDeal}
                className="self-start rounded-lg border border-red-300 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                削除
              </button>
            ) : null}
          </div>
        </div>

        {!editing ? (
          sanitizeDealNotes(currentDeal.notes) ? (
            <p className="mt-5 rounded-xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4 text-sm leading-7 text-[var(--color-text-dark)]">
              {sanitizeDealNotes(currentDeal.notes)}
            </p>
          ) : null
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <EditField label="案件名 *" className="md:col-span-2">
              <input className={EDIT_INPUT} value={editForm.title} onChange={(e) => setEditForm((c) => ({ ...c, title: e.target.value }))} />
            </EditField>
            <EditField label="分野">
              <select className={EDIT_INPUT} value={editForm.field} onChange={(e) => setEditForm((c) => ({ ...c, field: e.target.value }))}>
                {SSW_INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </EditField>
            <EditField label="案件ステータス">
              <select className={EDIT_INPUT} value={editForm.status} onChange={(e) => setEditForm((c) => ({ ...c, status: e.target.value }))}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </EditField>
            <EditField label="優先度">
              <select className={EDIT_INPUT} value={editForm.priority} onChange={(e) => setEditForm((c) => ({ ...c, priority: e.target.value }))}>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority.value} value={priority.value}>{priority.label}</option>
                ))}
              </select>
            </EditField>
            <EditField label="単価 (円)">
              <div className="relative">
                <input
                  className={`${EDIT_INPUT} pr-10`}
                  value={editForm.unitPrice}
                  onChange={(e) => setEditForm((c) => ({ ...c, unitPrice: e.target.value }))}
                  placeholder="450000"
                  inputMode="numeric"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">円</span>
              </div>
            </EditField>
            <EditField label="期限">
              <input className={EDIT_INPUT} type="date" value={editForm.deadline} onChange={(e) => setEditForm((c) => ({ ...c, deadline: e.target.value }))} />
            </EditField>
            <EditField label="案件受付日">
              <input className={EDIT_INPUT} type="date" value={editForm.acceptedAt} onChange={(e) => setEditForm((c) => ({ ...c, acceptedAt: e.target.value }))} />
            </EditField>
            <EditField label="メモ" className="md:col-span-2">
              <textarea className={`${EDIT_INPUT} min-h-24`} value={editForm.notes} onChange={(e) => setEditForm((c) => ({ ...c, notes: e.target.value }))} />
            </EditField>
            <div className="md:col-span-2 flex gap-2">
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={savingEdit}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {savingEdit ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 人数カウンター */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">人数カウンター</h2>
          <p className="text-xs text-gray-500">上下矢印で即時更新</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <CounterCell label="募集" value={currentDeal.requiredCount} onChange={(n) => void updateCounter("requiredCount", n)} />
          <CounterCell label="推薦" value={currentDeal.recommendedCount} onChange={(n) => void updateCounter("recommendedCount", n)} />
          <CounterCell label="面接" value={currentDeal.interviewCount} onChange={(n) => void updateCounter("interviewCount", n)} />
          <CounterCell label="内定" value={currentDeal.offerCount} onChange={(n) => void updateCounter("offerCount", n)} />
          <CounterCell label="内定辞退" value={currentDeal.declineCount} onChange={(n) => void updateCounter("declineCount", n)} tone="amber" />
          <CounterCell label="不合格" value={currentDeal.rejectCount} onChange={(n) => void updateCounter("rejectCount", n)} tone="red" />
        </div>
      </section>

      {/* 候補者追加 + カンバン (一つの島) */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-dark)]">候補者を追加</label>
            <PersonPicker
              persons={addablePersons}
              selectedId={selectedPersonId}
              onSelect={setSelectedPersonId}
            />
          </div>
          <button
            type="button"
            onClick={() => void addCandidate()}
            disabled={adding}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {adding ? "追加中..." : "候補者を追加"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
        {CANDIDATE_COLUMNS.map((column) => {
          const columnCandidates = candidates.filter((candidate) => candidate.stage === column);
          const colors = COLUMN_COLOR[column] ?? COLUMN_COLOR["接続済み"];
          return (
            <section
              key={column}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingCandidateId) {
                  void moveCandidate(draggingCandidateId, column);
                  setDraggingCandidateId(null);
                }
              }}
              className={`flex max-h-[calc(100vh-18rem)] min-w-0 flex-col rounded-xl border ${colors.border} bg-white p-2`}
            >
              <div className={`flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 ${colors.head}`}>
                <h3 className="text-[11px] font-semibold truncate">{column}</h3>
                <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold">
                  {columnCandidates.length}
                </span>
              </div>
              <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
                {columnCandidates.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={`/personnel/${candidate.person.id}/edit`}
                    draggable
                    onDragStart={() => setDraggingCandidateId(candidate.id)}
                    onDragEnd={() => setDraggingCandidateId(null)}
                    className={`block rounded-lg border p-2 transition ${colors.tile}`}
                    title={`${formatCandidateLabel(candidate.person)}\n${candidate.person.name}\n${candidate.person.nationality} / ${candidate.person.residenceStatus}\n紹介パートナー: ${candidate.person.partner?.name ?? "未設定"}${candidate.note ? `\n備考: ${candidate.note}` : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <PersonAvatar
                        photoUrl={candidate.person.photoUrl}
                        name={candidate.person.name}
                        size={28}
                        className="rounded-lg shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-[var(--color-text-dark)] truncate leading-tight">
                          {formatCandidateLabel(candidate.person)}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                          {candidate.person.nationality}
                        </p>
                      </div>
                    </div>
                    {candidate.note ? (
                      <p className="mt-1.5 text-[10px] text-gray-500 line-clamp-2">{candidate.note}</p>
                    ) : null}
                  </Link>
                ))}
                {columnCandidates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                    候補者なし
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
        </div>
      </section>

      {recommendationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-primary)]">
                  推薦リスト作成
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--color-text-dark)]">
                  {currentDeal.company.name} / {currentDeal.title}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  この案件の候補者から推薦リストを生成します。CSV ダウンロードまたは企業フォルダへ Drive 保存できます。
                </p>
              </div>
              <CloseButton onClick={() => setRecommendationOpen(false)} />
            </div>
            <div className="mt-5">
              <RecommendationsClient
                deals={[
                  {
                    id: currentDeal.id,
                    title: currentDeal.title,
                    companyName: currentDeal.company.name,
                    candidateCount: candidates.length,
                  },
                ]}
                lockedDealId={currentDeal.id}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-[var(--color-light)] px-3 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-[var(--color-text-dark)] text-right">{value}</span>
    </div>
  );
}

function EditField({
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
      <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

function priorityLabel(priority: string) {
  switch (priority) {
    case "urgent":
      return "急ぎ";
    case "high":
      return "高";
    default:
      return "通常";
  }
}

function priorityClass(priority: string) {
  if (priority === "urgent")
    return "rounded-full bg-[#DC2626] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm";
  if (priority === "high")
    return "rounded-full bg-[#F59E0B] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm";
  return "rounded-full bg-[var(--color-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)]";
}

// 案件メモに含まれる「流入:」「入社状況:」行は候補者情報なので、表示時に除外
function sanitizeDealNotes(value: string | null) {
  if (!value) return null;
  const cleaned = value
    .split(/\r?\n/)
    .filter((line) => !/^(流入|入社状況)[:：]/.test(line.trim()))
    .join("\n")
    .trim();
  return cleaned || null;
}

function statusClass(status: string) {
  if (status === "至急募集") return "rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-medium text-[#B91C1C]";
  if (status === "募集中") return "rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-medium text-[#92400E]";
  if (status === "面接中") return "rounded-full bg-[#DBEAFE] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8]";
  if (status === "クローズ") return "rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600";
  return "rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-medium text-[#166534]";
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

const EDIT_INPUT = INPUT;

function formatUnitPrice(value: string | null) {
  if (!value) return "未設定";
  // 旧データ互換: "45万円" は "450,000 円" に変換
  const manMatch = value.match(/^(-?\d+(?:\.\d+)?)\s*万円$/);
  if (manMatch) {
    const yen = Math.round(Number(manMatch[1]) * 10000);
    return `${yen.toLocaleString("ja-JP")} 円`;
  }
  if (value.includes("円")) return value;
  const n = Number(value.replace(/,/g, ""));
  if (Number.isFinite(n)) return `${n.toLocaleString("ja-JP")} 円`;
  return `${value} 円`;
}

function CounterCell({
  label,
  value,
  onChange,
  tone = "default",
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  tone?: "default" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
      : tone === "amber"
      ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
      : "border-gray-200 bg-white text-[var(--color-text-dark)]";
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label} を減らす`}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-[var(--color-primary)]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="min-w-[1.5rem] text-center text-xs tabular-nums text-gray-500">{value}</span>
        <button
          type="button"
          aria-label={`${label} を増やす`}
          onClick={() => onChange(value + 1)}
          className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-[var(--color-primary)]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

