"use client";

import Link from "next/link";
import { useState } from "react";
import type { OnboardingStageId } from "@/lib/onboarding-flow";

/**
 * 内定者管理ボード (Trello の置き換え)。
 * カードは「誰・どこの企業・メモ」だけ。列はドラッグで移す。
 * カードを押すと 担当 / 工程 / 申請日 / メモ の 4 つだけ編集できる。
 */

export type OnboardingCard = {
  personId: number;
  personName: string;
  residenceStatus: string;
  companyName: string | null;
  ownerId: number | null;
  ownerName: string | null;
  stage: OnboardingStageId;
  memo: string;
  /** YYYY-MM-DD (未申請は空) */
  applicationAt: string;
};

// 列の id は lib/onboarding-flow.ts と同じ。見出しだけ短くしている
const COLUMNS: { id: OnboardingStageId; label: string }[] = [
  { id: "offer", label: "内定" },
  { id: "documents", label: "書類集め" },
  { id: "prepare", label: "申請準備" },
  { id: "applying", label: "申請中" },
  { id: "result", label: "在留カード" },
  { id: "arrival", label: "入国・引っ越し" },
  { id: "joined", label: "入社・請求" },
  { id: "hold", label: "保留" },
];

const shortDate = (ymd: string) => ymd.slice(5).replace("-", "/");

export default function OnboardingBoard({
  initialCards,
  staff,
}: {
  initialCards: OnboardingCard[];
  staff: { id: number; name: string }[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<OnboardingStageId | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const save = async (personId: number, patch: Partial<OnboardingCard>) => {
    const before = cards;
    setCards((prev) => prev.map((c) => (c.personId === personId ? { ...c, ...patch } : c)));
    const body: Record<string, unknown> = {};
    if (patch.stage !== undefined) {
      body.stage = patch.stage;
      // 保留から出すと API が保留理由を消すので、表示中のメモを残しておく
      body.currentAction = before.find((c) => c.personId === personId)?.memo ?? "";
    }
    if (patch.ownerId !== undefined) body.followUpOwnerId = patch.ownerId;
    if (patch.memo !== undefined) body.currentAction = patch.memo;
    if (patch.applicationAt !== undefined) body.applicationAt = patch.applicationAt || null;
    const res = await fetch(`/api/onboarding/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setCards(before);
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
    }
  };

  const openCard = cards.find((c) => c.personId === openId) ?? null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = cards.filter((c) => c.stage === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.id ? null : s))}
              onDrop={() => {
                const card = cards.find((c) => c.personId === draggingId);
                if (card && card.stage !== col.id) void save(card.personId, { stage: col.id });
                setDraggingId(null);
                setOverStage(null);
              }}
              className={`flex h-[calc(100vh-11rem)] w-[220px] shrink-0 flex-col rounded-2xl border ${
                overStage === col.id
                  ? "border-[var(--color-primary)] bg-[var(--color-light)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="px-3 py-2.5 text-sm font-semibold text-[var(--color-text-dark)]">{col.label}</p>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {list.map((card) => (
                  <button
                    key={card.personId}
                    type="button"
                    draggable
                    onDragStart={() => setDraggingId(card.personId)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => setOpenId(card.personId)}
                    className="w-full cursor-grab rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:shadow-md"
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">{card.personName}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[card.companyName, card.ownerName].filter(Boolean).join(" ・ ")}
                    </p>
                    {card.applicationAt || card.memo ? (
                      <p className="mt-1.5 line-clamp-2 text-xs text-gray-700">
                        {[card.applicationAt ? `申請 ${shortDate(card.applicationAt)}` : "", card.memo]
                          .filter(Boolean)
                          .join(" ・ ")}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openCard ? (
        <CardEditor
          key={openCard.personId}
          card={openCard}
          staff={staff}
          onClose={() => setOpenId(null)}
          onSave={(patch) => {
            void save(openCard.personId, patch);
            setOpenId(null);
          }}
        />
      ) : null}
    </>
  );
}

function CardEditor({
  card,
  staff,
  onClose,
  onSave,
}: {
  card: OnboardingCard;
  staff: { id: number; name: string }[];
  onClose: () => void;
  onSave: (patch: Partial<OnboardingCard>) => void;
}) {
  const [ownerId, setOwnerId] = useState(card.ownerId ?? 0);
  const [stage, setStage] = useState(card.stage);
  const [applicationAt, setApplicationAt] = useState(card.applicationAt);
  const [memo, setMemo] = useState(card.memo);

  const submit = () => {
    // 変えた項目だけ送る (工程を触っていないのに滞留日数がリセットされないように)
    const patch: Partial<OnboardingCard> = {};
    if (ownerId !== (card.ownerId ?? 0)) {
      patch.ownerId = ownerId || null;
      patch.ownerName = staff.find((s) => s.id === ownerId)?.name ?? null;
    }
    if (stage !== card.stage) patch.stage = stage;
    if (applicationAt !== card.applicationAt) patch.applicationAt = applicationAt;
    if (memo.trim() !== card.memo) patch.memo = memo.trim();
    if (Object.keys(patch).length === 0) return onClose();
    onSave(patch);
  };

  const field = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/personnel/${card.personId}/edit`}
              className="text-lg font-bold text-[var(--color-text-dark)] hover:underline"
            >
              {card.personName}
            </Link>
            <p className="truncate text-xs text-gray-500">
              {[card.companyName, card.residenceStatus].filter(Boolean).join(" ・ ")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            工程
            <select value={stage} onChange={(e) => setStage(e.target.value as OnboardingStageId)} className={field}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            担当
            <select value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))} className={field}>
              <option value={0}>-</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-xs text-gray-500">
            申請日
            <input
              type="date"
              value={applicationAt}
              onChange={(e) => setApplicationAt(e.target.value)}
              className={field}
            />
          </label>
          <label className="col-span-2 text-xs text-gray-500">
            メモ
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} className={field} />
          </label>
        </div>

        <button
          type="button"
          onClick={submit}
          className="mt-4 w-full rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          保存
        </button>
      </div>
    </div>
  );
}
