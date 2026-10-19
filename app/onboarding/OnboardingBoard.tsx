"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  APPLICATION_TYPES,
  HOLD_STAGE,
  ONBOARDING_STAGES,
  stageOfPhase,
  type OnboardingStageId,
} from "@/lib/onboarding-flow";

/**
 * 内定者管理ボード。
 *
 * ボード: カードは「誰・どこ・次にやること・今の工程の進み具合」だけ。列はドラッグで移す。
 * 詳細:   今いる工程のチェックリストだけを大きく出す。他の工程は畳む。
 *         やることが無い (チェックリスト未作成) なら、申請種別のボタンを押すだけで作れる。
 *
 * 迷わせないための約束:
 *   - 1 行 = 1 タスク、行のどこを押してもチェックが入る
 *   - 期限切れは赤い文字。それ以外は色を付けない
 *   - 手順は普段隠しておき、必要なときだけ開く
 */

export type OnboardingTask = {
  id: number;
  /** 工程名 (スプレッドシートの「工程」と同じ)。列への振り分けに使う */
  category: string;
  title: string;
  /** YYYY-MM-DD (期限なしは空) */
  dueAt: string;
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
  /** 内定承諾日 (期限計算の基準。空なら期限が付かない) */
  offerAcceptedAt: string;
  /** 認定 / 変更 / 更新 / 特定活動 (未設定は空) */
  applicationType: string;
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
  { id: "result", label: "在留カード" },
  { id: "arrival", label: "入国・引っ越し" },
  { id: "joined", label: "入社・請求" },
  { id: "hold", label: "保留" },
];

const todayYmd = () => new Date().toISOString().slice(0, 10);
const shortDate = (ymd: string) => ymd.slice(5).replace("-", "/");
const isOverdue = (ymd: string) => Boolean(ymd) && ymd < todayYmd();

/** 今の工程に属するタスク。保留中は元の工程が分からないので全体を返す */
function tasksOfStage(card: OnboardingCard, stage = card.stage) {
  if (stage === HOLD_STAGE) return card.tasks;
  return card.tasks.filter((t) => stageOfPhase(t.category) === stage);
}

/** カードに 1 行だけ出す「次にやること」。メモがあればメモ、無ければ期限が近い未完了タスク */
function nextThing(card: OnboardingCard): { text: string; due: string } | null {
  if (card.memo) return { text: card.memo, due: "" };
  const pending = tasksOfStage(card)
    .filter((t) => !t.done)
    .sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999"));
  if (pending[0]) return { text: pending[0].title, due: pending[0].dueAt };
  return null;
}

export default function OnboardingBoard({
  initialCards,
  staff,
}: {
  initialCards: OnboardingCard[];
  staff: Staff[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<OnboardingStageId | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const patchLocal = (personId: number, patch: Partial<OnboardingCard>) =>
    setCards((prev) => prev.map((c) => (c.personId === personId ? { ...c, ...patch } : c)));

  /** 工程 / 担当 / 申請日 / メモ / 申請種別 を保存する。失敗したら元に戻す */
  const save = async (personId: number, patch: Partial<OnboardingCard>) => {
    const before = cards;
    const current = before.find((c) => c.personId === personId);
    patchLocal(personId, patch);
    const body: Record<string, unknown> = {};
    if (patch.stage !== undefined) {
      body.stage = patch.stage;
      // 保留から出すと API が保留理由を消すので、表示中のメモを残しておく
      body.currentAction = current?.memo ?? "";
    }
    if (patch.ownerId !== undefined) body.followUpOwnerId = patch.ownerId;
    if (patch.memo !== undefined) body.currentAction = patch.memo;
    if (patch.applicationAt !== undefined) body.applicationAt = patch.applicationAt || null;
    if (patch.offerAcceptedAt !== undefined) body.offerAcceptedAt = patch.offerAcceptedAt || null;
    if (patch.applicationType !== undefined) body.applicationType = patch.applicationType || null;
    const res = await fetch(`/api/onboarding/${personId}`, {
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
    // 申請種別を変えると API が未完了タスクを作り直して返す
    if (Array.isArray(data.tasks)) patchLocal(personId, { tasks: toTasks(data.tasks) });
  };

  const openCard = cards.find((c) => c.personId === openId) ?? null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = cards.filter((c) => c.stage === col.id);
          const dragging = cards.find((c) => c.personId === draggingId);
          const isTarget = Boolean(dragging) && overStage === col.id && dragging?.stage !== col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setOverStage((s) => (s === col.id ? null : s));
                }
              }}
              onDrop={() => {
                const card = cards.find((c) => c.personId === draggingId);
                if (card && card.stage !== col.id) void save(card.personId, { stage: col.id });
                setDraggingId(null);
                setOverStage(null);
              }}
              className={`flex h-[calc(100vh-11rem)] w-[230px] shrink-0 flex-col rounded-2xl border transition-all duration-150 ${
                isTarget
                  ? "scale-[1.02] border-[var(--color-primary)] bg-[var(--color-light)] shadow-lg ring-2 ring-[var(--color-primary)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="px-3 py-2.5 text-sm font-semibold text-[var(--color-text-dark)]">{col.label}</p>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {isTarget ? (
                  <div className="rounded-xl border-2 border-dashed border-[var(--color-primary)] bg-white/70 px-3 py-4 text-center text-xs font-semibold text-[var(--color-primary)]">
                    ここに移動
                  </div>
                ) : null}
                {list.map((card) => (
                  <BoardCard
                    key={card.personId}
                    card={card}
                    dragging={card.personId === draggingId}
                    onDragStart={() => setDraggingId(card.personId)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                    onClick={() => setOpenId(card.personId)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openCard ? (
        <CardDrawer
          key={openCard.personId}
          card={openCard}
          staff={staff}
          onClose={() => setOpenId(null)}
          onSave={(patch) => void save(openCard.personId, patch)}
          onLocal={(patch) => patchLocal(openCard.personId, patch)}
        />
      ) : null}
    </>
  );
}

function toTasks(raw: unknown[]): OnboardingTask[] {
  return raw.map((t) => {
    const o = t as Record<string, unknown>;
    return {
      id: Number(o.id),
      category: String(o.category ?? ""),
      title: String(o.title ?? ""),
      dueAt: o.dueAt ? String(o.dueAt).slice(0, 10) : "",
      done: Boolean(o.doneAt),
      note: typeof o.note === "string" ? o.note : "",
    };
  });
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
  const overdue = next ? isOverdue(next.due) : false;

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`w-full cursor-grab rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:shadow-md ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">{card.personName}</p>
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
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {[card.companyName, card.ownerName].filter(Boolean).join(" ・ ")}
      </p>
      {next ? (
        <p className={`mt-1.5 line-clamp-2 text-xs ${overdue ? "font-medium text-red-600" : "text-gray-700"}`}>
          {next.text}
          {next.due ? <span className="ml-1 text-[11px] opacity-80">{shortDate(next.due)}</span> : null}
        </p>
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
}: {
  card: OnboardingCard;
  staff: Staff[];
  onClose: () => void;
  onSave: (patch: Partial<OnboardingCard>) => void;
  onLocal: (patch: Partial<OnboardingCard>) => void;
}) {
  const [memo, setMemo] = useState(card.memo);
  const [busy, setBusy] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [showIssues, setShowIssues] = useState(card.issues.some((i) => i.open));
  const [issueText, setIssueText] = useState("");
  const [openNote, setOpenNote] = useState<number | null>(null);

  const stageIndex = COLUMNS.findIndex((c) => c.id === card.stage);
  const stageLabel = COLUMNS[stageIndex]?.label ?? "";
  const nextStage = card.stage !== HOLD_STAGE ? COLUMNS[stageIndex + 1] : undefined;

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

  const createTasks = async (type: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${card.personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createTasks", applicationType: type, replace: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`作成に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      onLocal({ applicationType: type, tasks: toTasks(data.tasks ?? []) });
    } finally {
      setBusy(false);
    }
  };

  const addIssue = async () => {
    const title = issueText.trim();
    if (!title) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${card.personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addIssue", title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`記録に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      onLocal({
        issues: [{ id: data.issue.id, title, open: true, createdAt: todayYmd() }, ...card.issues],
      });
      setIssueText("");
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 見出し: 誰か・どこか・担当・種別 */}
        <div className="border-b border-gray-200 px-5 py-4">
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
              <select
                value={card.stage}
                onChange={(e) => onSave({ stage: e.target.value as OnboardingStageId })}
                className={field}
              >
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
                <select
                  value={card.applicationType}
                  onChange={(e) => onSave({ applicationType: e.target.value })}
                  className={field}
                >
                  <option value="">-</option>
                  {APPLICATION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 今の工程のチェックリスト (ここが主役) */}
          <section className="px-5 py-4">
            {card.tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                  申請の種類を選ぶと、やることが並びます
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {card.offerAcceptedAt
                    ? `期限は内定承諾日 ${shortDate(card.offerAcceptedAt)} を起点に入ります`
                    : "内定承諾日が未入力なので、期限なしで作ります (下で入力できます)"}
                </p>
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
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                    {stageLabel}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {currentDone} / {current.length}
                    </span>
                  </p>
                  {!card.applicationType ? (
                    <span className="text-[11px] text-amber-700">種別を選ぶと必要書類が増えます</span>
                  ) : null}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-[var(--color-primary)]"}`}
                    style={{ width: current.length ? `${(currentDone / current.length) * 100}%` : "0%" }}
                  />
                </div>

                {current.length === 0 ? (
                  <p className="mt-4 text-center text-xs text-gray-400">この工程にやることはありません</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100">
                    {current.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        noteOpen={openNote === t.id}
                        onToggle={() => void toggle(t)}
                        onNote={() => setOpenNote(openNote === t.id ? null : t.id)}
                      />
                    ))}
                  </ul>
                )}

                {allDone && nextStage ? (
                  <button
                    type="button"
                    onClick={() => onSave({ stage: nextStage.id })}
                    className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    この工程は完了 → 「{nextStage.label}」へ進む
                  </button>
                ) : null}
              </>
            )}
          </section>

          {/* 他の工程 (畳んでおく) */}
          {card.tasks.length > 0 ? (
            <section className="border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                className="flex w-full items-center justify-between text-xs text-gray-500"
              >
                <span>他の工程</span>
                <span>{showOthers ? "閉じる" : "開く"}</span>
              </button>
              {showOthers ? (
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
                        <ul className="divide-y divide-gray-100 border-t border-gray-100">
                          {items.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              compact
                              noteOpen={openNote === t.id}
                              onToggle={() => void toggle(t)}
                              onNote={() => setOpenNote(openNote === t.id ? null : t.id)}
                            />
                          ))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              ) : null}
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
                <input
                  type="date"
                  value={card.offerAcceptedAt}
                  onChange={(e) => onSave({ offerAcceptedAt: e.target.value })}
                  className={`mt-1 w-full ${field}`}
                />
              </label>
              <label className="text-xs text-gray-500">
                申請日
                <input
                  type="date"
                  value={card.applicationAt}
                  onChange={(e) => onSave({ applicationAt: e.target.value })}
                  className={`mt-1 w-full ${field}`}
                />
              </label>
            </div>
          </section>

          {/* 問題 (畳んでおく。未解決があれば開いた状態) */}
          <section className="border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setShowIssues((v) => !v)}
              className="flex w-full items-center justify-between text-xs text-gray-500"
            >
              <span>
                起きた問題
                {openIssues > 0 ? (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                    未解決 {openIssues}
                  </span>
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addIssue()}
                    className="rounded-lg border border-gray-300 px-3 text-sm text-gray-700 disabled:opacity-50"
                  >
                    記録
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {card.issues.map((i) => (
                    <li
                      key={i.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
                        i.open ? "bg-red-50 text-gray-800" : "bg-gray-50 text-gray-400 line-through"
                      }`}
                    >
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

/** 1 行 = 1 タスク。行のどこを押してもチェックが入る */
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
  const overdue = !task.done && isOverdue(task.dueAt);
  return (
    <li>
      <div className={`flex items-start gap-3 ${compact ? "px-3 py-2" : "py-2.5"}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-pressed={task.done}
        >
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
          <span className="min-w-0 flex-1">
            <span className={`block text-sm leading-snug ${task.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
              {task.title}
            </span>
            {task.dueAt ? (
              <span className={`text-[11px] ${overdue ? "font-semibold text-red-600" : "text-gray-400"}`}>
                {shortDate(task.dueAt)}
                {overdue ? " 期限切れ" : ""}
              </span>
            ) : null}
          </span>
        </button>
        {task.note ? (
          <button
            type="button"
            onClick={onNote}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="手順・エビデンス"
          >
            {noteOpen ? "閉じる" : "手順"}
          </button>
        ) : null}
      </div>
      {noteOpen && task.note ? (
        <p className={`mb-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-600 ${compact ? "mx-3" : "ml-8"}`}>
          {task.note}
        </p>
      ) : null}
    </li>
  );
}
