"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  APPLICATION_TYPES,
  HOLD_STAGE,
  NEXT_STAGE,
  ONBOARDING_STAGES,
  SUPPORT_OPTIONS,
  stageOfPhase,
  type OnboardingStageId,
} from "@/lib/onboarding-flow";

/**
 * 内定者管理ボード。
 *
 * ボード: カードは「誰・どこ・次にやること・今の工程の進み具合」だけ。列はドラッグで移す。期限は出さない。
 * 詳細:   今いる工程のチェックリストを大きく出す (できていないものが上)。他の工程は進み具合だけ常に見せる。
 *         工程ごとに「すべて完了」で一括チェックできる (引っ越し不要の人など)。
 * 保留:   列ではなくボードの下に横向き。保留に入れるときは理由を書くポップが出る。
 * サポート: 入れるときに必要な支援 (銀行・保険・住居 …) を選ぶポップが出て、その分だけタスクになる。
 * 追加:   右上の「内定者を追加」で、候補者とは別の内定者 (書類作成のみ) を載せられる。
 * 委託管理の企業の内定者は出さない (件数だけ出して切り替えられる)。
 */

export type OnboardingTask = {
  id: number;
  /** 工程名 (スプレッドシートの「工程」と同じ)。列への振り分けに使う */
  category: string;
  title: string;
  done: boolean;
  /** 手順・エビデンス・過去の問題 */
  note: string;
};

export type OnboardingIssue = {
  id: number;
  title: string;
  open: boolean;
  createdAt: string;
};

export type OnboardingCard = {
  /** 内定者レコード (PersonPlacement) の id。API は /api/onboarding/p{id} */
  id: number;
  /** 候補者 id (候補者に紐づかない内定者は null) */
  personId: number | null;
  personName: string;
  residenceStatus: string;
  companyName: string | null;
  /** 候補者とは別に追加した内定者 */
  external: boolean;
  /** 委託管理の企業の内定者 (ボードには出さない) */
  outsourced: boolean;
  ownerId: number | null;
  ownerName: string | null;
  stage: OnboardingStageId;
  memo: string;
  holdReason: string;
  /** YYYY-MM-DD (未申請は空) */
  applicationAt: string;
  offerAcceptedAt: string;
  /** 認定 / 変更 / 更新 / 特定活動 (未設定は空) */
  applicationType: string;
  /** 申請方法 (短文) */
  applicationMethod: string;
  /** 選んだサポート (SUPPORT_OPTIONS の id) */
  supports: string[];
  tasks: OnboardingTask[];
  issues: OnboardingIssue[];
};

type Staff = { id: number; name: string };

// 列の id は lib/onboarding-flow.ts と同じ。見出しだけ短くしている
const COLUMNS: { id: OnboardingStageId; label: string }[] = [
  { id: "offer", label: "内定" },
  { id: "documents", label: "書類集め" },
  { id: "prepare", label: "申請準備" },
  { id: "applying", label: "申請中" },
  { id: "card_processing", label: "在留カード発行手続き中" },
  { id: "card_issued", label: "発行完了" },
  { id: "card_cancelled", label: "発行キャンセル" },
  { id: "support", label: "サポート" },
  { id: "joined", label: "入社・請求" },
  { id: "hold", label: "保留" },
];

const todayYmd = () => new Date().toISOString().slice(0, 10);
const apiPath = (card: OnboardingCard) => `/api/onboarding/p${card.id}`;

/** 今の工程に属するタスク。できていないものを上に並べる。保留中は元の工程が分からないので全体 */
function tasksOfStage(card: OnboardingCard, stage = card.stage) {
  const list = stage === HOLD_STAGE ? card.tasks : card.tasks.filter((t) => stageOfPhase(t.category) === stage);
  return [...list.filter((t) => !t.done), ...list.filter((t) => t.done)];
}

/** カードに 1 行だけ出す「次にやること」。保留なら保留理由、メモがあればメモ、無ければ最初の未完了タスク */
function nextThing(card: OnboardingCard): string | null {
  if (card.stage === HOLD_STAGE && card.holdReason) return `保留: ${card.holdReason}`;
  if (card.memo) return card.memo;
  const pending = tasksOfStage(card).find((t) => !t.done);
  return pending ? pending.title : null;
}

function toTasks(raw: unknown[]): OnboardingTask[] {
  return raw.map((t) => {
    const o = t as Record<string, unknown>;
    return {
      id: Number(o.id),
      category: String(o.category ?? ""),
      title: String(o.title ?? ""),
      done: Boolean(o.doneAt),
      note: typeof o.note === "string" ? o.note : "",
    };
  });
}

export default function OnboardingBoard({ initialCards, staff }: { initialCards: OnboardingCard[]; staff: Staff[] }) {
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<OnboardingStageId | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showOutsourced, setShowOutsourced] = useState(false);
  const [adding, setAdding] = useState(false);
  // 保留 / サポートに入れるときのポップ (移動先が決まってから保存する)
  const [pendingHold, setPendingHold] = useState<number | null>(null);
  const [pendingSupport, setPendingSupport] = useState<number | null>(null);

  const visible = cards.filter((c) => showOutsourced || !c.outsourced);
  const outsourcedCount = cards.filter((c) => c.outsourced).length;

  const patchLocal = (id: number, patch: Partial<OnboardingCard>) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** 工程 / 担当 / 日付 / メモ / 申請種別 / 申請方法 / 保留理由 を保存する。失敗したら元に戻す */
  const save = async (id: number, patch: Partial<OnboardingCard>) => {
    const before = cards;
    const card = before.find((c) => c.id === id);
    if (!card) return;
    patchLocal(id, patch);
    const body: Record<string, unknown> = {};
    if (patch.stage !== undefined) {
      body.stage = patch.stage;
      body.currentAction = card.memo;
      if (patch.stage === HOLD_STAGE) body.holdReason = patch.holdReason ?? card.holdReason;
    }
    if (patch.holdReason !== undefined && patch.stage === undefined) body.holdReason = patch.holdReason;
    if (patch.ownerId !== undefined) body.followUpOwnerId = patch.ownerId;
    if (patch.memo !== undefined) body.currentAction = patch.memo;
    if (patch.applicationAt !== undefined) body.applicationAt = patch.applicationAt || null;
    if (patch.offerAcceptedAt !== undefined) body.offerAcceptedAt = patch.offerAcceptedAt || null;
    if (patch.applicationType !== undefined) body.applicationType = patch.applicationType || null;
    if (patch.applicationMethod !== undefined) body.applicationMethod = patch.applicationMethod || null;
    const res = await fetch(apiPath(card), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setCards(before);
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
      return;
    }
    if (Array.isArray(data.tasks)) patchLocal(id, { tasks: toTasks(data.tasks) });
  };

  /** 列へ移す。保留とサポートは先にポップを出す */
  const moveTo = (card: OnboardingCard, stage: OnboardingStageId) => {
    if (card.stage === stage) return;
    if (stage === HOLD_STAGE) setPendingHold(card.id);
    else if (stage === "support") setPendingSupport(card.id);
    else void save(card.id, { stage });
  };

  const setSupports = async (card: OnboardingCard, supports: string[], alsoMove: boolean) => {
    if (alsoMove) await save(card.id, { stage: "support" });
    const res = await fetch(apiPath(card), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setSupports", supports }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
      return;
    }
    patchLocal(card.id, { supports, tasks: toTasks(data.tasks ?? []) });
  };

  const openCard = cards.find((c) => c.id === openId) ?? null;
  const holdCard = cards.find((c) => c.id === pendingHold) ?? null;
  const supportCard = cards.find((c) => c.id === pendingSupport) ?? null;

  const dropHandlers = (stage: OnboardingStageId) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverStage(stage);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStage((s) => (s === stage ? null : s));
    },
    onDrop: () => {
      const card = cards.find((c) => c.id === draggingId);
      if (card) moveTo(card, stage);
      setDraggingId(null);
      setOverStage(null);
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">内定者管理</h1>
        <div className="flex items-center gap-3">
          {outsourcedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowOutsourced((v) => !v)}
              className="text-xs text-gray-500 underline decoration-dotted hover:text-[var(--color-primary)]"
            >
              {showOutsourced ? `委託管理 ${outsourcedCount} 名を隠す` : `委託管理 ${outsourcedCount} 名は非表示`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            + 内定者を追加
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.filter((c) => c.id !== HOLD_STAGE).map((col) => {
          const list = visible.filter((c) => c.stage === col.id);
          const dragging = cards.find((c) => c.id === draggingId);
          const isTarget = Boolean(dragging) && overStage === col.id && dragging?.stage !== col.id;
          return (
            <div
              key={col.id}
              {...dropHandlers(col.id)}
              className={`flex h-[calc(100vh-19rem)] w-[210px] shrink-0 flex-col rounded-2xl border transition-all duration-150 ${
                isTarget
                  ? "scale-[1.02] border-[var(--color-primary)] bg-[var(--color-light)] shadow-lg ring-2 ring-[var(--color-primary)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="px-3 py-2.5 text-sm font-semibold text-[var(--color-text-dark)]">
                {col.label}
                {list.length > 0 ? <span className="ml-1.5 text-xs font-normal text-gray-400">{list.length}</span> : null}
              </p>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {isTarget ? (
                  <div className="rounded-xl border-2 border-dashed border-[var(--color-primary)] bg-white/70 px-3 py-4 text-center text-xs font-semibold text-[var(--color-primary)]">
                    ここに移動
                  </div>
                ) : null}
                {list.map((card) => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    dragging={card.id === draggingId}
                    onDragStart={() => setDraggingId(card.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                    onClick={() => setOpenId(card.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 保留: 工程から外れている人を一目で拾えるよう、下に横向きで置く */}
      {(() => {
        const list = visible.filter((c) => c.stage === HOLD_STAGE);
        const dragging = cards.find((c) => c.id === draggingId);
        const isTarget = Boolean(dragging) && overStage === HOLD_STAGE && dragging?.stage !== HOLD_STAGE;
        return (
          <div
            {...dropHandlers(HOLD_STAGE)}
            className={`mt-3 rounded-2xl border p-3 transition-all duration-150 ${
              isTarget ? "border-[var(--color-primary)] bg-[var(--color-light)] ring-2 ring-[var(--color-primary)]" : "border-gray-200 bg-gray-50"
            }`}
          >
            <p className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">
              保留
              {list.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-500">{list.length}</span> : null}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {isTarget ? (
                <div className="flex w-[210px] shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-primary)] bg-white/70 text-xs font-semibold text-[var(--color-primary)]">
                  ここに移動
                </div>
              ) : null}
              {list.map((card) => (
                <div key={card.id} className="w-[210px] shrink-0">
                  <BoardCard
                    card={card}
                    dragging={card.id === draggingId}
                    onDragStart={() => setDraggingId(card.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                    onClick={() => setOpenId(card.id)}
                  />
                </div>
              ))}
              {list.length === 0 && !isTarget ? (
                <p className="py-2 text-xs text-gray-400">保留中の人はいません（カードをここへドラッグすると保留になります）</p>
              ) : null}
            </div>
          </div>
        );
      })()}

      {openCard ? (
        <CardDrawer
          key={openCard.id}
          card={openCard}
          staff={staff}
          onClose={() => setOpenId(null)}
          onSave={(patch) => void save(openCard.id, patch)}
          onLocal={(patch) => patchLocal(openCard.id, patch)}
          onMove={(stage) => moveTo(openCard, stage)}
          onPickSupports={() => setPendingSupport(openCard.id)}
        />
      ) : null}

      {holdCard ? (
        <HoldReasonModal
          card={holdCard}
          onCancel={() => setPendingHold(null)}
          onConfirm={(reason) => {
            setPendingHold(null);
            void save(holdCard.id, { stage: HOLD_STAGE, holdReason: reason });
          }}
        />
      ) : null}

      {supportCard ? (
        <SupportModal
          card={supportCard}
          onCancel={() => setPendingSupport(null)}
          onConfirm={(supports) => {
            setPendingSupport(null);
            void setSupports(supportCard, supports, supportCard.stage !== "support");
          }}
        />
      ) : null}

      {adding ? (
        <AddEntryModal
          staff={staff}
          onCancel={() => setAdding(false)}
          onCreated={(card) => {
            setCards((prev) => [card, ...prev]);
            setAdding(false);
            setOpenId(card.id);
          }}
        />
      ) : null}
    </>
  );
}

/* ───────────────────────── カード ───────────────────────── */

function BoardCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  card: OnboardingCard;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const stageTasks = tasksOfStage(card);
  const done = stageTasks.filter((t) => t.done).length;
  const complete = stageTasks.length > 0 && done === stageTasks.length;
  const next = nextThing(card);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`w-full cursor-grab rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:shadow-md ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">
          {card.personName}
          {card.external ? <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] font-normal text-gray-500">書類のみ</span> : null}
        </p>
        {stageTasks.length > 0 ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              complete ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
            title="この工程のチェックリスト"
          >
            {done}/{stageTasks.length}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-gray-500">{[card.companyName, card.ownerName].filter(Boolean).join(" ・ ")}</p>
      {next ? (
        <p className={`mt-1.5 line-clamp-2 text-xs ${card.stage === HOLD_STAGE ? "font-medium text-amber-700" : "text-gray-700"}`}>{next}</p>
      ) : complete ? (
        <p className="mt-1.5 text-xs text-emerald-700">この工程は完了。次へ進めます</p>
      ) : null}
    </button>
  );
}

/* ───────────────────────── 詳細 (右から出る) ───────────────────────── */

function CardDrawer({
  card,
  staff,
  onClose,
  onSave,
  onLocal,
  onMove,
  onPickSupports,
}: {
  card: OnboardingCard;
  staff: Staff[];
  onClose: () => void;
  onSave: (patch: Partial<OnboardingCard>) => void;
  onLocal: (patch: Partial<OnboardingCard>) => void;
  onMove: (stage: OnboardingStageId) => void;
  onPickSupports: () => void;
}) {
  const [memo, setMemo] = useState(card.memo);
  const [holdReason, setHoldReason] = useState(card.holdReason);
  const [method, setMethod] = useState(card.applicationMethod);
  const [busy, setBusy] = useState(false);
  const [showIssues, setShowIssues] = useState(card.issues.some((i) => i.open));
  const [issueText, setIssueText] = useState("");
  const [openNote, setOpenNote] = useState<number | null>(null);

  const stageLabel = COLUMNS.find((c) => c.id === card.stage)?.label ?? "";
  const nextId = NEXT_STAGE[card.stage];
  const nextStage = nextId ? COLUMNS.find((c) => c.id === nextId) : undefined;

  const current = useMemo(() => tasksOfStage(card), [card]);
  const currentDone = current.filter((t) => t.done).length;
  const allDone = current.length > 0 && currentDone === current.length;

  const toggle = async (task: OnboardingTask) => {
    const next = !task.done;
    onLocal({ tasks: card.tasks.map((t) => (t.id === task.id ? { ...t, done: next } : t)) });
    const res = await fetch(`/api/onboarding/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: next }),
    });
    if (!res.ok) {
      onLocal({ tasks: card.tasks });
      alert("更新に失敗しました");
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(apiPath(card), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error ?? res.statusText);
    return data;
  };

  /** 工程のタスクを一括で完了 / 戻す */
  const completeStage = async (stage: OnboardingStageId, undo = false) => {
    setBusy(true);
    try {
      const data = await post({ action: "completeStage", stage, undo });
      onLocal({ tasks: toTasks(data.tasks ?? []) });
    } catch (e) {
      alert(`更新に失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const createTasks = async (type: string) => {
    setBusy(true);
    try {
      const data = await post({ action: "createTasks", applicationType: type, replace: true });
      onLocal({ applicationType: type, tasks: toTasks(data.tasks ?? []) });
    } catch (e) {
      alert(`作成に失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const addIssue = async () => {
    const title = issueText.trim();
    if (!title) return;
    setBusy(true);
    try {
      const data = await post({ action: "addIssue", title });
      onLocal({ issues: [{ id: data.issue.id, title, open: true, createdAt: todayYmd() }, ...card.issues] });
      setIssueText("");
    } catch (e) {
      alert(`記録に失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const resolveIssue = async (issue: OnboardingIssue) => {
    onLocal({ issues: card.issues.map((i) => (i.id === issue.id ? { ...i, open: !issue.open } : i)) });
    await fetch(`/api/onboarding/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: issue.open ? "closed" : "open" }),
    });
  };

  const field = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800";
  const openIssues = card.issues.filter((i) => i.open).length;
  const supportLabels = SUPPORT_OPTIONS.filter((o) => card.supports.includes(o.id)).map((o) => o.label);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 見出し: 誰か・どこか・担当・工程・種別・申請方法 */}
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {card.personId ? (
                <Link href={`/personnel/${card.personId}/edit`} className="text-lg font-bold text-[var(--color-text-dark)] hover:underline">
                  {card.personName}
                </Link>
              ) : (
                <p className="text-lg font-bold text-[var(--color-text-dark)]">
                  {card.personName}
                  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-500">書類作成のみ (候補者とは別)</span>
                </p>
              )}
              <p className="truncate text-xs text-gray-500">{[card.companyName, card.residenceStatus].filter(Boolean).join(" ・ ")}</p>
            </div>
            <button type="button" onClick={onClose} className="px-1 text-xl leading-none text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <label className="flex items-center gap-1">
              担当
              <select
                value={card.ownerId ?? 0}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  onSave({ ownerId: id || null, ownerName: staff.find((s) => s.id === id)?.name ?? null });
                }}
                className={field}
              >
                <option value={0}>-</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              工程
              <select value={card.stage} onChange={(e) => onMove(e.target.value as OnboardingStageId)} className={field}>
                {COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {card.tasks.length > 0 ? (
              <label className="flex items-center gap-1">
                種別
                <select value={card.applicationType} onChange={(e) => onSave({ applicationType: e.target.value })} className={field}>
                  <option value="">-</option>
                  {APPLICATION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex min-w-[12rem] flex-1 items-center gap-1">
              申請方法
              <input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                onBlur={() => method.trim() !== card.applicationMethod && onSave({ applicationMethod: method.trim() })}
                placeholder="例: 本人がオンライン申請"
                className={`flex-1 ${field}`}
              />
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 保留理由 (保留中だけ) */}
          {card.stage === HOLD_STAGE ? (
            <section className="border-b border-amber-100 bg-amber-50 px-5 py-3">
              <label className="block text-xs font-semibold text-amber-800">
                保留の理由
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  onBlur={() => holdReason.trim() !== card.holdReason && onSave({ holdReason: holdReason.trim() })}
                  rows={2}
                  className={`mt-1 w-full ${field}`}
                />
              </label>
            </section>
          ) : null}

          {/* サポートの内容 (サポート工程だけ) */}
          {card.stage === "support" ? (
            <section className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  必要なサポート: {supportLabels.length > 0 ? supportLabels.join("・") : "未選択"}
                </p>
                <button type="button" onClick={onPickSupports} className="shrink-0 text-xs text-[var(--color-primary)] hover:underline">
                  選び直す
                </button>
              </div>
            </section>
          ) : null}

          {/* 今の工程のチェックリスト (ここが主役) */}
          <section className="px-5 py-4">
            {card.tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">申請の種類を選ぶと、やることが並びます</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {APPLICATION_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy}
                      onClick={() => void createTasks(t)}
                      className="rounded-lg border border-[var(--color-primary)] py-2.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-light)] disabled:opacity-50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                    {stageLabel}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {currentDone} / {current.length}
                    </span>
                  </p>
                  {current.length > 0 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void completeStage(card.stage, allDone)}
                      className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
                    >
                      {allDone ? "すべて戻す" : "すべて完了にする"}
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-[var(--color-primary)]"}`}
                    style={{ width: current.length ? `${(currentDone / current.length) * 100}%` : "0%" }}
                  />
                </div>

                {current.length === 0 ? (
                  <p className="mt-4 text-center text-xs text-gray-400">
                    {card.stage === "support" ? "「選び直す」で必要なサポートを選ぶと、やることが並びます" : "この工程にやることはありません"}
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100">
                    {current.map((t) => (
                      <TaskRow key={t.id} task={t} noteOpen={openNote === t.id} onToggle={() => void toggle(t)} onNote={() => setOpenNote(openNote === t.id ? null : t.id)} />
                    ))}
                  </ul>
                )}

                {(allDone || current.length === 0) && nextStage ? (
                  <button
                    type="button"
                    onClick={() => onMove(nextStage.id)}
                    className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {allDone ? "この工程は完了 → " : ""}「{nextStage.label}」へ進む
                  </button>
                ) : null}
              </>
            )}
          </section>

          {/* 他の工程 (常に見せる。各工程を押すと中のタスクが開く。工程ごとに一括完了できる) */}
          {card.tasks.length > 0 ? (
            <section className="border-t border-gray-100 px-5 py-3">
              <p className="text-xs text-gray-500">他の工程</p>
              <div className="mt-2 space-y-1">
                {ONBOARDING_STAGES.filter((s) => s.id !== HOLD_STAGE && s.id !== card.stage).map((s) => {
                  const items = tasksOfStage(card, s.id);
                  if (items.length === 0) return null;
                  const d = items.filter((t) => t.done).length;
                  const label = COLUMNS.find((c) => c.id === s.id)?.label ?? s.label;
                  return (
                    <details key={s.id} className="rounded-lg border border-gray-100">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs">
                        <span className="text-gray-700">{label}</span>
                        <span className={`tabular-nums ${d === items.length ? "text-emerald-600" : "text-gray-400"}`}>
                          {d}/{items.length}
                        </span>
                      </summary>
                      <div className="border-t border-gray-100 px-3 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void completeStage(s.id, d === items.length)}
                          className="text-[11px] text-[var(--color-primary)] hover:underline disabled:opacity-50"
                        >
                          {d === items.length ? "すべて戻す" : "この工程をすべて完了にする"}
                        </button>
                      </div>
                      <ul className="divide-y divide-gray-100 border-t border-gray-100">
                        {items.map((t) => (
                          <TaskRow key={t.id} task={t} compact noteOpen={openNote === t.id} onToggle={() => void toggle(t)} onNote={() => setOpenNote(openNote === t.id ? null : t.id)} />
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* メモ・日付 */}
          <section className="border-t border-gray-100 px-5 py-4">
            <label className="block text-xs text-gray-500">
              メモ（カードに出ます）
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={() => memo.trim() !== card.memo && onSave({ memo: memo.trim() })}
                rows={2}
                className={`mt-1 w-full ${field}`}
                placeholder="例: アパート手配の見通しを企業と確認"
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">
                内定承諾日
                <input type="date" value={card.offerAcceptedAt} onChange={(e) => onSave({ offerAcceptedAt: e.target.value })} className={`mt-1 w-full ${field}`} />
              </label>
              <label className="text-xs text-gray-500">
                申請日
                <input type="date" value={card.applicationAt} onChange={(e) => onSave({ applicationAt: e.target.value })} className={`mt-1 w-full ${field}`} />
              </label>
            </div>
          </section>

          {/* 問題 (畳んでおく。未解決があれば開いた状態) */}
          <section className="border-t border-gray-100 px-5 py-3">
            <button type="button" onClick={() => setShowIssues((v) => !v)} className="flex w-full items-center justify-between text-xs text-gray-500">
              <span>
                起きた問題
                {openIssues > 0 ? (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">未解決 {openIssues}</span>
                ) : null}
              </span>
              <span>{showIssues ? "閉じる" : "開く"}</span>
            </button>
            {showIssues ? (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    value={issueText}
                    onChange={(e) => setIssueText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void addIssue()}
                    placeholder="例: 書類不備で再申請"
                    className={`flex-1 ${field}`}
                  />
                  <button type="button" disabled={busy} onClick={() => void addIssue()} className="rounded-lg border border-gray-300 px-3 text-sm text-gray-700 disabled:opacity-50">
                    記録
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {card.issues.map((i) => (
                    <li key={i.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${i.open ? "bg-red-50 text-gray-800" : "bg-gray-50 text-gray-400 line-through"}`}>
                      <span className="min-w-0 truncate">{i.title}</span>
                      <button type="button" onClick={() => void resolveIssue(i)} className="shrink-0 text-gray-500 hover:underline">
                        {i.open ? "解決" : "戻す"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

/** 1 行 = 1 タスク。行のどこを押してもチェックが入る (期限は出さない) */
function TaskRow({
  task,
  compact = false,
  noteOpen,
  onToggle,
  onNote,
}: {
  task: OnboardingTask;
  compact?: boolean;
  noteOpen: boolean;
  onToggle: () => void;
  onNote: () => void;
}) {
  return (
    <li>
      <div className={`flex items-start gap-3 ${compact ? "px-3 py-2" : "py-2.5"}`}>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-pressed={task.done}>
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              task.done ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-gray-300 bg-white"
            }`}
          >
            {task.done ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </span>
          <span className={`block min-w-0 flex-1 text-sm leading-snug ${task.done ? "text-gray-400 line-through" : "text-gray-800"}`}>{task.title}</span>
        </button>
        {task.note ? (
          <button type="button" onClick={onNote} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="手順・エビデンス">
            {noteOpen ? "閉じる" : "手順"}
          </button>
        ) : null}
      </div>
      {noteOpen && task.note ? (
        <p className={`mb-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-600 ${compact ? "mx-3" : "ml-8"}`}>{task.note}</p>
      ) : null}
    </li>
  );
}

/* ───────────────────────── ポップ ───────────────────────── */

function ModalFrame({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">{title}</p>
        {children}
      </div>
    </div>
  );
}

const MODAL_INPUT = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-[var(--color-primary)] focus:outline-none";
const BTN_SUB = "rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50";
const BTN_MAIN = "rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50";

/** 保留に入れるときの理由 */
function HoldReasonModal({ card, onCancel, onConfirm }: { card: OnboardingCard; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(card.holdReason);
  return (
    <ModalFrame title={`${card.personName} を保留にする`} onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          onConfirm(reason.trim());
        }}
      >
        <label className="mt-3 block text-xs text-gray-600">
          保留の理由 (カードに出ます)
          <textarea autoFocus required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 住居が決まらず入社日未定。企業の回答待ち" className={MODAL_INPUT} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={BTN_SUB}>
            やめる
          </button>
          <button type="submit" disabled={!reason.trim()} className={BTN_MAIN}>
            保留にする
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

/** サポートに入れるときに必要な支援を選ぶ */
function SupportModal({ card, onCancel, onConfirm }: { card: OnboardingCard; onCancel: () => void; onConfirm: (supports: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(card.supports);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <ModalFrame title={`${card.personName} に必要なサポート`} onCancel={onCancel}>
      <p className="mt-1 text-xs text-gray-500">選んだものだけがチェックリストになります（不要なものは外してください）。</p>
      <div className="mt-3 space-y-1.5">
        {SUPPORT_OPTIONS.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selected.includes(o.id) ? "border-[var(--color-primary)] bg-[var(--color-light)]" : "border-gray-200"}`}>
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4" />
            <span className="text-gray-800">{o.label}</span>
            <span className="ml-auto text-[11px] text-gray-400">{o.tasks.length} 件</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BTN_SUB}>
          やめる
        </button>
        <button type="button" onClick={() => onConfirm(selected)} className={BTN_MAIN}>
          {card.stage === "support" ? "この内容にする" : "サポートへ移す"}
        </button>
      </div>
    </ModalFrame>
  );
}

/** 候補者とは別の内定者 (書類作成のみ) を追加する */
function AddEntryModal({ staff, onCancel, onCreated }: { staff: Staff[]; onCancel: () => void; onCreated: (card: OnboardingCard) => void }) {
  const [form, setForm] = useState({ name: "", companyName: "", residenceStatus: "", followUpOwnerId: "", applicationType: "", applicationMethod: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, followUpOwnerId: form.followUpOwnerId ? Number(form.followUpOwnerId) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`追加に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      const ownerId = form.followUpOwnerId ? Number(form.followUpOwnerId) : null;
      onCreated({
        id: Number(data.placement.id),
        personId: null,
        personName: form.name.trim(),
        residenceStatus: form.residenceStatus.trim(),
        companyName: form.companyName.trim() || null,
        external: true,
        outsourced: false,
        ownerId,
        ownerName: staff.find((s) => s.id === ownerId)?.name ?? null,
        stage: "offer",
        memo: "",
        holdReason: "",
        applicationAt: "",
        offerAcceptedAt: "",
        applicationType: form.applicationType,
        applicationMethod: form.applicationMethod.trim(),
        supports: [],
        tasks: toTasks(data.tasks ?? []),
        issues: [],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame title="内定者を追加（候補者とは別に管理）" onCancel={onCancel}>
      <p className="mt-1 text-xs text-gray-500">書類作成だけを請け負った人など、候補者一覧には載せない内定者を追加します。</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="block text-xs text-gray-600">
          名前 *
          <input autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} className={MODAL_INPUT} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-600">
            企業名
            <input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} className={MODAL_INPUT} />
          </label>
          <label className="block text-xs text-gray-600">
            在留資格
            <input value={form.residenceStatus} onChange={(e) => set("residenceStatus", e.target.value)} placeholder="特定技能1号" className={MODAL_INPUT} />
          </label>
          <label className="block text-xs text-gray-600">
            担当
            <select value={form.followUpOwnerId} onChange={(e) => set("followUpOwnerId", e.target.value)} className={MODAL_INPUT}>
              <option value="">-</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gray-600">
            申請種別
            <select value={form.applicationType} onChange={(e) => set("applicationType", e.target.value)} className={MODAL_INPUT}>
              <option value="">-</option>
              {APPLICATION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-gray-600">
          申請方法 (短文)
          <input value={form.applicationMethod} onChange={(e) => set("applicationMethod", e.target.value)} placeholder="例: 書類作成のみ。提出は本人" className={MODAL_INPUT} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={BTN_SUB}>
            やめる
          </button>
          <button type="submit" disabled={busy || !form.name.trim()} className={BTN_MAIN}>
            追加する
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
