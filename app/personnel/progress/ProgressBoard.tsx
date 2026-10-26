"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { APPLICATION_TYPES } from "@/lib/onboarding-flow";
import {
  AfterReturnSummary,
  STAGES,
  StageDateModal,
  slash,
  usableHints,
  type PlacementData,
} from "../[id]/edit/PlacementPanel";

export type ProgressCard = {
  personId: number;
  /** 英語名 (無ければカナ名) */
  name: string;
  kanaName: string | null;
  companyName: string;
  /** 企業 (求人) の担当者 */
  ownerName: string;
  /** 候補者カンバンのステージ (列の位置の目安) */
  kanbanStage: string;
  placement: PlacementData;
  /** カンバンで動かしたときの日付 (空の段階の候補) */
  kanbanDates: Partial<Record<string, string>>;
  /** 内定者管理のカード (無ければ null) */
  cardId: number | null;
  /** 入社まで済んだ人 (最初は出さない) */
  joined: boolean;
};

/** 候補者カンバンのステージ → この表の列 (日付がまだ無い人の置き場所) */
const KANBAN_COLUMN: Record<string, number> = {
  接続済み: 0,
  事前面談済み: 1,
  推薦済み: 1,
  面接済み: 2,
  内定済み: 3,
  内定承諾: 4,
  入社待ち: 7,
  入社済み: 7,
};

/** カードを置く列 = 日付が入っている一番後ろの段階と、カンバンのステージの進んでいる方 */
function columnOf(card: ProgressCard) {
  const dated = STAGES.reduce((last, st, i) => (card.placement[st.field] ? i : last), -1);
  return Math.max(dated, KANBAN_COLUMN[card.kanbanStage] ?? 0, 0);
}

/** 置いた列までで日付が空の段階の数 (すべて埋める) */
function missingOf(card: ProgressCard) {
  return STAGES.slice(0, columnOf(card) + 1).filter((st) => !card.placement[st.field]).length;
}

/**
 * 進捗ボード (内定者管理と同じ形)。全員を段階の列に並べ、カードを押すと右に詳細が出る。
 * カードを列へ動かすと、その段階の日付を入れるポップが出る (前の段階が空なら一緒に入れる)。
 * 一時帰国より後は内定者管理で入れる。
 */
export default function ProgressBoard({ initialCards, me, demo = false }: { initialCards: ProgressCard[]; me: string; demo?: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [filter, setFilter] = useState<"all" | "mine" | "missing">("all");
  const [showJoined, setShowJoined] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [pending, setPending] = useState<{ personId: number; index: number } | null>(null);

  const visible = cards.filter((c) => {
    if (!showJoined && c.joined) return false;
    if (filter === "mine") return c.ownerName === me;
    if (filter === "missing") return missingOf(c) > 0;
    return true;
  });
  const open = cards.find((c) => c.personId === openId) ?? null;
  const pendingCard = pending ? cards.find((c) => c.personId === pending.personId) ?? null : null;

  const save = async (personId: number, patch: Partial<PlacementData>) => {
    const before = cards;
    const card = cards.find((c) => c.personId === personId);
    setCards((prev) => prev.map((c) => (c.personId === personId ? { ...c, placement: { ...c.placement, ...patch } } : c)));
    if (demo) return;
    const res = await fetch(`/api/personnel/${personId}/placement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setCards(before);
      alert("保存に失敗しました");
      return;
    }
    // 内定承諾・申請を入れると内定者管理にカードができるので、読み直す
    if (!card?.cardId && (patch.offerAcceptedAt || patch.applicationPlannedAt || patch.applicationAt || patch.applicationResultAt)) {
      router.refresh();
    }
  };

  const chip = (value: typeof filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-lg border px-3 py-1 text-sm ${filter === value ? "border-gray-400 bg-gray-100 font-semibold" : "border-gray-200 bg-white"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "すべて")}
        {chip("mine", "自分の担当")}
        {chip("missing", "日付が未入力")}
        <label className="ml-2 flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showJoined} onChange={(e) => setShowJoined(e.target.checked)} className="accent-[var(--color-primary)]" />
          入社した人も出す
        </label>
        <span className="ml-auto text-xs text-gray-500">カードを列へ動かすと日付を入れます。一時帰国より後は内定者管理で入れます。</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((st, i) => {
          const list = visible
            .filter((c) => columnOf(c) === i)
            .sort((a, b) => missingOf(b) - missingOf(a) || a.name.localeCompare(b.name));
          const dragging = cards.find((c) => c.personId === draggingId);
          const isTarget = Boolean(dragging) && over === i && dragging && columnOf(dragging) !== i;
          return (
            <div
              key={st.field}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging && columnOf(dragging) !== i) setPending({ personId: dragging.personId, index: i });
                setDraggingId(null);
              }}
              className={`flex h-[calc(100vh-15rem)] min-w-[170px] flex-1 flex-col rounded-2xl border transition-all duration-150 ${
                isTarget
                  ? "scale-[1.02] border-[var(--color-primary)] bg-[var(--color-light)] shadow-lg ring-2 ring-[var(--color-primary)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="px-3 py-2.5 text-sm font-semibold text-[var(--color-text-dark)]">
                {st.label}
                {list.length > 0 ? <span className="ml-1.5 text-xs font-normal text-gray-400">{list.length}</span> : null}
              </p>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {isTarget ? (
                  <div className="rounded-xl border-2 border-dashed border-[var(--color-primary)] bg-white/70 px-3 py-4 text-center text-xs font-semibold text-[var(--color-primary)]">
                    ここに移動
                  </div>
                ) : null}
                {list.map((card) => {
                  const missing = missingOf(card);
                  const date = card.placement[st.field];
                  return (
                    <button
                      key={card.personId}
                      type="button"
                      draggable
                      onDragStart={() => setDraggingId(card.personId)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOver(null);
                      }}
                      onClick={() => setOpenId(card.personId)}
                      className={`w-full cursor-grab rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:shadow-md ${
                        draggingId === card.personId ? "opacity-40" : ""
                      }`}
                    >
                      <p className="text-sm font-semibold text-[var(--color-text-dark)]">{card.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{card.companyName}</p>
                      {card.ownerName ? <p className="truncate text-xs text-gray-500">担当 {card.ownerName}</p> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                        {date ? <span className="tabular-nums text-gray-600">{slash(date)}</span> : null}
                        {missing > 0 ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">日付が未入力 {missing}</span>
                        ) : null}
                        {card.cardId ? <span className="rounded bg-[var(--color-light)] px-1.5 py-0.5 text-[var(--color-primary)]">内定者管理</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {open ? <ProgressDrawer card={open} demo={demo} onClose={() => setOpenId(null)} onSave={(patch) => save(open.personId, patch)} /> : null}

      {pending && pendingCard ? (
        <StageDateModal
          index={pending.index}
          placement={pendingCard.placement}
          kanbanDates={usableHints(pendingCard.placement, pendingCard.kanbanDates)}
          onClose={() => setPending(null)}
          onSave={async (patch) => {
            setPending(null);
            await save(pendingCard.personId, patch);
          }}
        />
      ) : null}
    </div>
  );
}

/** カードを押したときの詳細 (右から出す)。段階ごとの日付をその場で直せる */
function ProgressDrawer({
  card,
  demo,
  onClose,
  onSave,
}: {
  card: ProgressCard;
  demo: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PlacementData>) => Promise<void>;
}) {
  const column = columnOf(card);
  const hints = usableHints(card.placement, card.kanbanDates);
  const [applicantName, setApplicantName] = useState(card.placement.applicantName ?? "");
  const field = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            {demo ? (
              <p className="text-lg font-bold text-[var(--color-text-dark)]">{card.name}</p>
            ) : (
              <Link href={`/personnel/${card.personId}/edit`} className="text-lg font-bold text-[var(--color-text-dark)] hover:underline">
                {card.name}
              </Link>
            )}
            {card.kanaName ? <p className="text-sm text-gray-500">{card.kanaName}</p> : null}
            <p className="text-xs text-gray-500">
              {[card.companyName, card.ownerName ? `担当 ${card.ownerName}` : "", card.kanbanStage ? `カンバン: ${card.kanbanStage}` : ""]
                .filter(Boolean)
                .join(" ・ ")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {STAGES.map((st, i) => {
              const value = card.placement[st.field]?.slice(0, 10) ?? "";
              const missing = !value && i <= column;
              return (
                <label
                  key={st.field}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1 ${missing ? "bg-amber-50" : ""}`}
                >
                  <span className={`w-32 shrink-0 text-sm ${missing ? "font-semibold text-amber-800" : "text-gray-600"}`}>{st.label}</span>
                  <input
                    type="date"
                    value={value}
                    onChange={(e) => void onSave({ [st.field]: e.target.value || null })}
                    className={`flex-1 ${field}`}
                  />
                  {!value && hints[st.field] ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        void onSave({ [st.field]: hints[st.field] });
                      }}
                      title="カンバンで動かした日付を入れる"
                      className="shrink-0 text-xs text-[var(--color-primary)] underline"
                    >
                      カンバン {slash(hints[st.field])}
                    </button>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              申請種別
              <select
                value={card.placement.applicationType ?? ""}
                onChange={(e) => void onSave({ applicationType: e.target.value || null })}
                className={`mt-1 w-full ${field}`}
              >
                <option value="">未入力</option>
                {APPLICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {card.placement.applicationType && !(APPLICATION_TYPES as readonly string[]).includes(card.placement.applicationType) ? (
                  <option value={card.placement.applicationType}>{card.placement.applicationType}</option>
                ) : null}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              申請者
              <input
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                onBlur={() => applicantName.trim() !== (card.placement.applicantName ?? "") && void onSave({ applicantName: applicantName.trim() || null })}
                className={`mt-1 w-full ${field}`}
              />
            </label>
          </div>

          <AfterReturnSummary placement={card.placement} cardId={demo ? null : card.cardId} />
        </div>
      </div>
    </div>
  );
}
