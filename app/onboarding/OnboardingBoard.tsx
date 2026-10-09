"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PLACEMENT_STAGES, type PlacementStageId } from "@/lib/placement-stage";
import { ONBOARDING_TASK_CATEGORIES } from "@/lib/onboarding-tasks";

/**
 * 内定後管理ボード (Trello 風)。
 *
 * - 列 = ステージ (内定 → 内定承諾 → 申請中 → 結果受領 → 入国済み → 入社済み)
 * - カード = 内定者 1 人。次アクション・期限・チェックリストの進み具合・未解決の問題を表示
 * - カードを掴んで別の列に落とすとステージが変わる
 * - カードを押すと右から詳細が開き、チェックリストの消し込みと問題の記録ができる
 *
 * 期限が過ぎているものは赤、3 日以内は黄色で出す。
 * 「誰が・いつまでに・次に何をするか」が一目で分かることを最優先にしている。
 */

export type OnboardingTask = {
  id: number;
  category: string;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  doneBy: string | null;
};

export type OnboardingIssue = {
  id: number;
  title: string;
  detail: string | null;
  status: string;
  recordedBy: string | null;
  createdAt: string;
};

export type OnboardingCard = {
  personId: number;
  personName: string;
  englishName: string | null;
  photoUrl: string | null;
  nationality: string;
  companyName: string | null;
  dealTitle: string | null;
  ownerName: string | null;
  stage: PlacementStageId;
  currentAction: string | null;
  nextActionDueAt: string | null;
  offerAcceptedAt: string | null;
  applicationAt: string | null;
  entryPlannedAt: string | null;
  joinPlannedAt: string | null;
  tasks: OnboardingTask[];
  issues: OnboardingIssue[];
};

const DAY = 86_400_000;

/** 期限の状態 (なし / 期限切れ / まもなく / 余裕あり) */
function dueState(dueAt: string | null): "none" | "over" | "soon" | "ok" {
  if (!dueAt) return "none";
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return "over";
  if (diff < 3 * DAY) return "soon";
  return "ok";
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
}

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY);
}

export default function OnboardingBoard({
  initialCards,
  owners,
}: {
  initialCards: OnboardingCard[];
  owners: string[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<PlacementStageId | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("すべて");
  const [onlyAlert, setOnlyAlert] = useState(false);

  const patchCard = (personId: number, patch: Partial<OnboardingCard>) =>
    setCards((prev) => prev.map((c) => (c.personId === personId ? { ...c, ...patch } : c)));

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        if (ownerFilter !== "すべて" && (c.ownerName ?? "未設定") !== ownerFilter) return false;
        if (onlyAlert) {
          const overdueTask = c.tasks.some((t) => !t.doneAt && dueState(t.dueAt) === "over");
          const overdueAction = dueState(c.nextActionDueAt) === "over";
          const openIssue = c.issues.some((i) => i.status === "open");
          const noAction = !c.currentAction;
          if (!overdueTask && !overdueAction && !openIssue && !noAction) return false;
        }
        return true;
      }),
    [cards, ownerFilter, onlyAlert],
  );

  /** 上部サマリー: 要対応の件数 */
  const alerts = useMemo(() => {
    let overdue = 0;
    let noAction = 0;
    let openIssues = 0;
    for (const c of cards) {
      if (c.tasks.some((t) => !t.doneAt && dueState(t.dueAt) === "over")) overdue++;
      if (!c.currentAction) noAction++;
      openIssues += c.issues.filter((i) => i.status === "open").length;
    }
    return { overdue, noAction, openIssues, total: cards.length };
  }, [cards]);

  const move = async (personId: number, stage: PlacementStageId) => {
    const before = cards;
    patchCard(personId, { stage });
    const res = await fetch(`/api/onboarding/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setCards(before);
      alert(`ステージの更新に失敗しました: ${data.error ?? res.statusText}`);
    }
  };

  const openCard = cards.find((c) => c.personId === openId) ?? null;

  return (
    <div className="space-y-4">
      {/* サマリー + 絞り込み */}
      <div className="flex flex-wrap items-center gap-3">
        <Stat label="内定者" value={`${alerts.total} 名`} />
        <Stat label="期限超過あり" value={`${alerts.overdue} 名`} tone={alerts.overdue > 0 ? "red" : "plain"} />
        <Stat label="次アクション未記入" value={`${alerts.noAction} 名`} tone={alerts.noAction > 0 ? "amber" : "plain"} />
        <Stat label="未解決の問題" value={`${alerts.openIssues} 件`} tone={alerts.openIssues > 0 ? "red" : "plain"} />
        <div className="ml-auto flex items-center gap-2">
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {["すべて", ...owners, "未設定"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
            <input type="checkbox" checked={onlyAlert} onChange={(e) => setOnlyAlert(e.target.checked)} />
            要対応だけ
          </label>
        </div>
      </div>

      {/* ボード */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PLACEMENT_STAGES.map((stage) => {
          const list = visible.filter((c) => c.stage === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => {
                if (draggingId !== null) void move(draggingId, stage.id);
                setDraggingId(null);
                setOverStage(null);
              }}
              className={`flex w-[270px] shrink-0 flex-col rounded-2xl border p-3 ${
                overStage === stage.id
                  ? "border-[var(--color-primary)] bg-[var(--color-light)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">{stage.label}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">
                  {list.length}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                {list.map((card) => (
                  <BoardCard
                    key={card.personId}
                    card={card}
                    onDragStart={() => setDraggingId(card.personId)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => setOpenId(card.personId)}
                  />
                ))}
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-[11px] text-gray-400">
                    なし
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {openCard ? (
        <CardDetail
          card={openCard}
          onClose={() => setOpenId(null)}
          onPatch={(patch) => patchCard(openCard.personId, patch)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "red" | "amber" }) {
  const color =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-gray-200 bg-white text-[var(--color-text-dark)]";
  return (
    <div className={`rounded-xl border px-3 py-1.5 ${color}`}>
      <span className="text-[11px] opacity-70">{label}</span>
      <span className="ml-2 text-sm font-bold">{value}</span>
    </div>
  );
}

function BoardCard({
  card,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  card: OnboardingCard;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const done = card.tasks.filter((t) => t.doneAt).length;
  const overdueTasks = card.tasks.filter((t) => !t.doneAt && dueState(t.dueAt) === "over").length;
  const openIssues = card.issues.filter((i) => i.status === "open").length;
  const actionDue = dueState(card.nextActionDueAt);
  const stalled = daysSince(card.offerAcceptedAt);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`w-full cursor-grab rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md ${
        overdueTasks > 0 || openIssues > 0 ? "border-red-300" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2">
        {card.photoUrl ? (
          <Image src={card.photoUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-bold text-white">
            {card.personName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--color-text-dark)]">
            {card.personName}
          </p>
          <p className="truncate text-[11px] text-gray-500">{card.companyName ?? "企業未紐付け"}</p>
        </div>
      </div>

      {/* 次アクション */}
      <div className="mt-2 rounded-lg bg-gray-50 px-2 py-1.5">
        {card.currentAction ? (
          <p className="line-clamp-2 text-[11px] text-gray-700">{card.currentAction}</p>
        ) : (
          <p className="text-[11px] font-medium text-amber-700">次アクション未記入</p>
        )}
        {card.nextActionDueAt ? (
          <p
            className={`mt-0.5 text-[10px] font-semibold ${
              actionDue === "over" ? "text-red-600" : actionDue === "soon" ? "text-amber-700" : "text-gray-500"
            }`}
          >
            期限 {fmt(card.nextActionDueAt)}
            {actionDue === "over" ? "（超過）" : ""}
          </p>
        ) : null}
      </div>

      {/* チェックリストの進み具合 */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>やること {done} / {card.tasks.length}</span>
          {overdueTasks > 0 ? <span className="font-semibold text-red-600">期限超過 {overdueTasks}</span> : null}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[var(--color-primary)]"
            style={{ width: card.tasks.length ? `${(done / card.tasks.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.ownerName ? (
          <span className="rounded-full bg-[var(--color-light)] px-2 py-0.5 text-[10px] text-[var(--color-primary)]">
            {card.ownerName}
          </span>
        ) : null}
        {openIssues > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            問題 {openIssues}
          </span>
        ) : null}
        {stalled !== null ? (
          <span className="ml-auto text-[10px] text-gray-400">内定承諾から {stalled} 日</span>
        ) : null}
      </div>
    </button>
  );
}

/** 右から開く詳細パネル */
function CardDetail({
  card,
  onClose,
  onPatch,
}: {
  card: OnboardingCard;
  onClose: () => void;
  onPatch: (patch: Partial<OnboardingCard>) => void;
}) {
  const [action, setAction] = useState(card.currentAction ?? "");
  const [actionDue, setActionDue] = useState(card.nextActionDueAt?.slice(0, 10) ?? "");
  const [issueTitle, setIssueTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const saveAction = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${card.personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAction: action, nextActionDueAt: actionDue || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      onPatch({
        currentAction: action.trim() || null,
        nextActionDueAt: actionDue ? new Date(actionDue).toISOString() : null,
      });
    } finally {
      setBusy(false);
    }
  };

  const createTasks = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${card.personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createTasks" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`作成に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      if (data.tasks) {
        onPatch({
          tasks: (data.tasks as { id: number; category: string; title: string; dueAt: string | null }[]).map((t) => ({
            id: t.id,
            category: t.category,
            title: t.title,
            dueAt: t.dueAt,
            doneAt: null,
            doneBy: null,
          })),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task: OnboardingTask) => {
    const next = task.doneAt ? null : new Date().toISOString();
    onPatch({
      tasks: card.tasks.map((t) => (t.id === task.id ? { ...t, doneAt: next } : t)),
    });
    const res = await fetch(`/api/onboarding/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.doneAt }),
    });
    if (!res.ok) {
      onPatch({ tasks: card.tasks });
      alert("更新に失敗しました");
    }
  };

  const addIssue = async () => {
    if (!issueTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/onboarding/${card.personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addIssue", title: issueTitle }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`記録に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      onPatch({ issues: [data.issue as OnboardingIssue, ...card.issues] });
      setIssueTitle("");
    } finally {
      setBusy(false);
    }
  };

  const closeIssue = async (issue: OnboardingIssue) => {
    const next = issue.status === "open" ? "closed" : "open";
    onPatch({
      issues: card.issues.map((i) => (i.id === issue.id ? { ...i, status: next } : i)),
    });
    await fetch(`/api/onboarding/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  };

  const grouped = ONBOARDING_TASK_CATEGORIES.map((category) => ({
    category,
    items: card.tasks.filter((t) => t.category === category),
  })).filter((g) => g.items.length > 0);
  const others = card.tasks.filter(
    (t) => !ONBOARDING_TASK_CATEGORIES.includes(t.category as (typeof ONBOARDING_TASK_CATEGORIES)[number]),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-lg font-bold text-[var(--color-text-dark)]">{card.personName}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {card.companyName ?? "企業未紐付け"}
              {card.ownerName ? ` ・ 担当 ${card.ownerName}` : ""}
            </p>
            <Link
              href={`/personnel/${card.personId}/edit`}
              className="mt-1 inline-block text-[11px] text-[var(--color-primary)] hover:underline"
            >
              候補者詳細を開く →
            </Link>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* 次アクション */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">次にやること</p>
          <textarea
            className="mt-2 min-h-16 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="例: 受付票を企業へ共有"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[11px] text-gray-500">期限</label>
            <input
              type="date"
              value={actionDue}
              onChange={(e) => setActionDue(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => void saveAction()}
              disabled={busy}
              className="ml-auto rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>

        {/* チェックリスト */}
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">
              やること（{card.tasks.filter((t) => t.doneAt).length} / {card.tasks.length}）
            </p>
            {card.tasks.length === 0 ? (
              <button
                type="button"
                onClick={() => void createTasks()}
                disabled={busy}
                className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] disabled:opacity-50"
              >
                標準チェックリストを作成
              </button>
            ) : null}
          </div>
          {card.tasks.length === 0 ? (
            <p className="mt-2 text-[12px] text-gray-500">
              内定承諾日を起点に、条件確認・書類・申請・渡航住居・入社後の 20 項目を自動で作ります。
            </p>
          ) : null}
          <div className="mt-3 space-y-4">
            {[...grouped, ...(others.length ? [{ category: "その他", items: others }] : [])].map((g) => (
              <div key={g.category}>
                <p className="text-[11px] font-semibold text-gray-400">{g.category}</p>
                <ul className="mt-1 space-y-1">
                  {g.items.map((t) => {
                    const state = t.doneAt ? "done" : dueState(t.dueAt);
                    return (
                      <li key={t.id} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={Boolean(t.doneAt)}
                          onChange={() => void toggleTask(t)}
                          className="mt-0.5 accent-[var(--color-primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] ${
                              t.doneAt ? "text-gray-400 line-through" : "text-gray-800"
                            }`}
                          >
                            {t.title}
                          </span>
                          <span
                            className={`text-[10px] ${
                              state === "over"
                                ? "font-semibold text-red-600"
                                : state === "soon"
                                  ? "text-amber-700"
                                  : "text-gray-400"
                            }`}
                          >
                            {t.dueAt ? `期限 ${fmt(t.dueAt)}` : "期限なし"}
                            {state === "over" ? " ・超過" : ""}
                            {t.doneAt ? ` ・完了 ${fmt(t.doneAt)}${t.doneBy ? ` (${t.doneBy})` : ""}` : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 起きた問題 */}
        <div className="px-6 py-4">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">起きた問題・クレーム</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            記録しておくと、同じことが次の案件で起きないよう振り返れます。
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="例: 申請書類の不備で再申請"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void addIssue()}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              記録
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {card.issues.map((i) => (
              <li
                key={i.id}
                className={`rounded-lg border px-3 py-2 ${
                  i.status === "open" ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-[13px] ${i.status === "closed" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                    {i.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => void closeIssue(i)}
                    className="shrink-0 text-[11px] text-gray-500 hover:underline"
                  >
                    {i.status === "open" ? "解決にする" : "戻す"}
                  </button>
                </div>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {fmt(i.createdAt)}
                  {i.recordedBy ? ` ・ ${i.recordedBy}` : ""}
                </p>
              </li>
            ))}
            {card.issues.length === 0 ? (
              <li className="rounded-lg border border-dashed border-gray-200 py-3 text-center text-[11px] text-gray-400">
                記録なし
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
