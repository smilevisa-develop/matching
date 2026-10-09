"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  APPLICATION_TYPES,
  HOLD_STAGE,
  ONBOARDING_STAGES,
  type OnboardingStageId,
  type Urgency,
} from "@/lib/onboarding-flow";

/**
 * 内定者管理ボード (Trello 風)。
 *
 * カードだけで次の 4 つが分かるようにしている:
 *   緊急か (赤/黄/通常 + 理由) / 担当は誰か (採用・内定フォロー) /
 *   どの工程で何日止まっているか / 何が足りないか (未完了タスクの先頭)
 *
 * 「保留・問題対応中」列は、問題が解決するまで一時的に置く場所。
 * 元の工程を覚えているので、解除すると元の列に戻る。
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
  residenceStatus: string;
  visaExpiryDate: string | null;
  companyName: string | null;
  recruitOwnerName: string | null;
  followUpOwnerId: number | null;
  followUpOwnerName: string | null;
  applicationType: string | null;
  stage: OnboardingStageId;
  stageChangedAt: string | null;
  holdReason: string | null;
  currentAction: string | null;
  nextActionDueAt: string | null;
  offerAcceptedAt: string | null;
  applicationPlannedAt: string | null;
  applicationAt: string | null;
  applicationResultAt: string | null;
  entryPlannedAt: string | null;
  joinPlannedAt: string | null;
  joinAt: string | null;
  urgency: Urgency;
  urgencyReasons: string[];
  tasks: OnboardingTask[];
  issues: OnboardingIssue[];
};

const DAY = 86_400_000;

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
}

function daysSince(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY);
}

function isOver(date: string | null) {
  return Boolean(date && new Date(date).getTime() < Date.now());
}

const URGENCY_STYLE: Record<Urgency, { accent: string; badge: string; label: string; dot: string }> = {
  red: {
    accent: "border-l-red-500 border-gray-200",
    badge: "bg-red-100 text-red-700",
    label: "至急",
    dot: "bg-red-500",
  },
  amber: {
    accent: "border-l-amber-400 border-gray-200",
    badge: "bg-amber-100 text-amber-800",
    label: "注意",
    dot: "bg-amber-400",
  },
  normal: {
    accent: "border-l-gray-200 border-gray-200",
    badge: "bg-gray-100 text-gray-500",
    label: "",
    dot: "bg-gray-300",
  },
};

/**
 * そのカードで「次にやること」を 1 つだけ決める。
 * 手入力の次アクションがあればそれ、無ければ未完了タスクのうち期限が一番近いもの。
 */
function nextThing(card: OnboardingCard): { label: string; due: string | null; overdue: boolean } {
  if (card.stage === HOLD_STAGE && card.holdReason) {
    return { label: `保留: ${card.holdReason}`, due: card.nextActionDueAt, overdue: isOver(card.nextActionDueAt) };
  }
  if (card.currentAction) {
    return { label: card.currentAction, due: card.nextActionDueAt, overdue: isOver(card.nextActionDueAt) };
  }
  const pending = card.tasks
    .filter((t) => !t.doneAt)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  if (pending.length > 0) {
    return { label: pending[0].title, due: pending[0].dueAt, overdue: isOver(pending[0].dueAt) };
  }
  if (card.tasks.length === 0) {
    return { label: "チェックリストを作成する", due: null, overdue: false };
  }
  return { label: "次の工程へ進める", due: null, overdue: false };
}

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
  const [ownerFilter, setOwnerFilter] = useState("すべて");
  const [urgencyOnly, setUrgencyOnly] = useState(false);

  const patchCard = (personId: number, patch: Partial<OnboardingCard>) =>
    setCards((prev) => prev.map((c) => (c.personId === personId ? { ...c, ...patch } : c)));

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        if (ownerFilter !== "すべて") {
          const names = [c.followUpOwnerName, c.recruitOwnerName].filter(Boolean);
          if (ownerFilter === "未設定" ? names.length > 0 : !names.includes(ownerFilter)) return false;
        }
        if (urgencyOnly && c.urgency === "normal") return false;
        return true;
      }),
    [cards, ownerFilter, urgencyOnly],
  );

  const summary = useMemo(() => {
    const red = cards.filter((c) => c.urgency === "red").length;
    const amber = cards.filter((c) => c.urgency === "amber").length;
    const hold = cards.filter((c) => c.stage === HOLD_STAGE).length;
    const noOwner = cards.filter((c) => !c.followUpOwnerName).length;
    return { total: cards.length, red, amber, hold, noOwner };
  }, [cards]);

  const move = async (personId: number, stage: OnboardingStageId) => {
    const before = cards;
    let holdReason: string | null = null;
    if (stage === HOLD_STAGE) {
      holdReason = window.prompt("保留にする理由を入力してください（例: アパート未確定で待ち）") ?? "";
      if (!holdReason.trim()) return;
    }
    patchCard(personId, { stage, stageChangedAt: new Date().toISOString(), holdReason });
    const res = await fetch(`/api/onboarding/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, holdReason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setCards(before);
      alert(`更新に失敗しました: ${data.error ?? res.statusText}`);
    }
  };

  const openCard = cards.find((c) => c.personId === openId) ?? null;
  const ownerOptions = Array.from(new Set(staff.map((s) => s.name)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="内定者" value={`${summary.total} 名`} />
        <Stat label="至急" value={`${summary.red} 名`} tone={summary.red ? "red" : "plain"} />
        <Stat label="注意" value={`${summary.amber} 名`} tone={summary.amber ? "amber" : "plain"} />
        <Stat label="保留中" value={`${summary.hold} 名`} tone={summary.hold ? "red" : "plain"} />
        <Stat label="フォロー担当未設定" value={`${summary.noOwner} 名`} tone={summary.noOwner ? "amber" : "plain"} />
        <div className="ml-auto flex items-center gap-2">
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {["すべて", ...ownerOptions, "未設定"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
            <input type="checkbox" checked={urgencyOnly} onChange={(e) => setUrgencyOnly(e.target.checked)} />
            要対応だけ
          </label>
        </div>
      </div>

      {/* 工程の列。列ごとに高さを固定して、中だけスクロールする */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ONBOARDING_STAGES.filter((s) => s.id !== HOLD_STAGE).map((stage) => {
          const list = visible.filter((c) => c.stage === stage.id);
          const alerts = list.filter((c) => c.urgency === "red").length;
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
              className={`flex h-[58vh] w-[240px] shrink-0 flex-col rounded-2xl border ${
                overStage === stage.id
                  ? "border-[var(--color-primary)] bg-[var(--color-light)]"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <p className="truncate text-[12px] font-semibold text-[var(--color-text-dark)]" title={stage.hint}>
                  {stage.label}
                </p>
                <span className="flex shrink-0 items-center gap-1">
                  {alerts > 0 ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      {alerts}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
                    {list.length}
                  </span>
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
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
                  <p className="py-4 text-center text-[11px] text-gray-300">なし</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 保留は下に横並びで置く (工程から外れている人を一目で拾えるように) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOverStage(HOLD_STAGE);
        }}
        onDragLeave={() => setOverStage((s) => (s === HOLD_STAGE ? null : s))}
        onDrop={() => {
          if (draggingId !== null) void move(draggingId, HOLD_STAGE);
          setDraggingId(null);
          setOverStage(null);
        }}
        className={`rounded-2xl border p-3 ${
          overStage === HOLD_STAGE ? "border-[var(--color-primary)] bg-[var(--color-light)]" : "border-red-200 bg-red-50/50"
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <p className="text-[12px] font-semibold text-red-700">⚠ 保留・問題対応中</p>
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
            {visible.filter((c) => c.stage === HOLD_STAGE).length}
          </span>
          <span className="text-[10px] text-gray-500">
            ここにドラッグすると理由を聞きます。戻すと元の工程に復帰します。
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {visible
            .filter((c) => c.stage === HOLD_STAGE)
            .map((card) => (
              <BoardCard
                key={card.personId}
                card={card}
                horizontal
                onDragStart={() => setDraggingId(card.personId)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setOpenId(card.personId)}
              />
            ))}
          {visible.filter((c) => c.stage === HOLD_STAGE).length === 0 ? (
            <p className="w-full py-3 text-center text-[11px] text-gray-400">保留中の人はいません</p>
          ) : null}
        </div>
      </div>

      {openCard ? (
        <CardDetail
          card={openCard}
          staff={staff}
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

/**
 * カード 1 枚。載せるのは 4 つだけ:
 *   「誰か」「次に何をするか + 期限」「担当」「どれだけ止まっているか」
 * 理由や未完了の一覧は詳細パネルで見る (カードに詰め込むと重要な情報が埋もれる)。
 */
function BoardCard({
  card,
  onDragStart,
  onDragEnd,
  onClick,
  horizontal = false,
}: {
  card: OnboardingCard;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  horizontal?: boolean;
}) {
  const next = nextThing(card);
  const style = URGENCY_STYLE[card.urgency];
  const done = card.tasks.filter((t) => t.doneAt).length;
  const stageDays = daysSince(card.stageChangedAt);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`${horizontal ? "w-[250px] shrink-0" : "w-full"} cursor-grab rounded-xl border-l-4 border-y border-r bg-white p-2.5 text-left shadow-sm transition hover:shadow-md ${style.accent}`}
    >
      {/* 名前 + 緊急バッジ */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text-dark)]">
          {card.personName}
        </p>
        {card.urgency !== "normal" ? (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>
            {style.label}
          </span>
        ) : null}
      </div>
      <p className="truncate text-[10px] text-gray-400">
        {card.companyName ?? "企業未紐付け"}
        {card.applicationType ? ` ・ ${card.applicationType}` : ""}
      </p>

      {/* 次にやること (1 行) */}
      <div className={`mt-1.5 rounded-lg px-2 py-1.5 ${next.overdue ? "bg-red-50" : "bg-gray-50"}`}>
        <p className="line-clamp-2 text-[12px] leading-snug text-gray-800">{next.label}</p>
        {next.due ? (
          <p className={`mt-0.5 text-[10px] ${next.overdue ? "font-semibold text-red-600" : "text-gray-500"}`}>
            {fmt(next.due)}
            {next.overdue ? ` ・${Math.abs(daysSince(next.due) ?? 0)}日超過` : "まで"}
          </p>
        ) : null}
      </div>

      {/* 担当 / 進捗 / 滞留 */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
        <span
          className={`truncate rounded px-1.5 py-0.5 ${
            card.followUpOwnerName
              ? "bg-[var(--color-light)] text-[var(--color-primary)]"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {card.followUpOwnerName ?? "担当未設定"}
        </span>
        {card.tasks.length > 0 ? (
          <span className="text-gray-400">
            {done}/{card.tasks.length}
          </span>
        ) : null}
        {stageDays !== null && stageDays > 0 ? (
          <span className={`ml-auto ${stageDays > 14 ? "font-semibold text-amber-700" : "text-gray-400"}`}>
            {stageDays}日
          </span>
        ) : null}
      </div>
    </button>
  );
}

function CardDetail({
  card,
  staff,
  onClose,
  onPatch,
}: {
  card: OnboardingCard;
  staff: { id: number; name: string }[];
  onClose: () => void;
  onPatch: (patch: Partial<OnboardingCard>) => void;
}) {
  const [action, setAction] = useState(card.currentAction ?? "");
  const [actionDue, setActionDue] = useState(card.nextActionDueAt?.slice(0, 10) ?? "");
  const [appType, setAppType] = useState(card.applicationType ?? "");
  const [ownerId, setOwnerId] = useState(card.followUpOwnerId ?? 0);
  const [issueTitle, setIssueTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>, method: "PATCH" | "POST" = "PATCH") => {
    const res = await fetch(`/api/onboarding/${card.personId}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`保存に失敗しました: ${data.error ?? res.statusText}`);
      return null;
    }
    return data;
  };

  const saveAction = async () => {
    setBusy(true);
    try {
      const ok = await call({ currentAction: action, nextActionDueAt: actionDue || null });
      if (ok) {
        onPatch({
          currentAction: action.trim() || null,
          nextActionDueAt: actionDue ? new Date(actionDue).toISOString() : null,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const saveOwner = async (id: number) => {
    setOwnerId(id);
    const ok = await call({ followUpOwnerId: id || null });
    if (ok) {
      onPatch({
        followUpOwnerId: id || null,
        followUpOwnerName: staff.find((s) => s.id === id)?.name ?? null,
      });
    }
  };

  const createTasks = async (replace = false) => {
    setBusy(true);
    try {
      const data = await call({ action: "createTasks", applicationType: appType || null, replace }, "POST");
      if (data?.tasks) {
        onPatch({
          applicationType: appType || null,
          tasks: (data.tasks as OnboardingTask[]).map((t) => ({
            id: t.id,
            category: t.category,
            title: t.title,
            dueAt: t.dueAt,
            doneAt: t.doneAt ?? null,
            doneBy: t.doneBy ?? null,
          })),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task: OnboardingTask) => {
    const next = task.doneAt ? null : new Date().toISOString();
    onPatch({ tasks: card.tasks.map((t) => (t.id === task.id ? { ...t, doneAt: next } : t)) });
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
      const data = await call({ action: "addIssue", title: issueTitle }, "POST");
      if (data?.issue) {
        onPatch({ issues: [data.issue as OnboardingIssue, ...card.issues] });
        setIssueTitle("");
      }
    } finally {
      setBusy(false);
    }
  };

  const closeIssue = async (issue: OnboardingIssue) => {
    const next = issue.status === "open" ? "closed" : "open";
    onPatch({ issues: card.issues.map((i) => (i.id === issue.id ? { ...i, status: next } : i)) });
    await fetch(`/api/onboarding/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  };

  const categories = Array.from(new Set(card.tasks.map((t) => t.category)));
  const style = URGENCY_STYLE[card.urgency];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                <p className="text-lg font-bold text-[var(--color-text-dark)]">{card.personName}</p>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {card.companyName ?? "企業未紐付け"} ・ {card.nationality} ・ {card.residenceStatus}
                {card.visaExpiryDate ? ` ・ 在留期限 ${card.visaExpiryDate}` : ""}
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
          {card.urgencyReasons.length > 0 ? (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${
                card.urgency === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {card.urgencyReasons.join(" / ")}
            </p>
          ) : null}
        </div>

        {/* 担当・申請種別・予定日 */}
        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-6 py-4">
          <label className="text-[11px] text-gray-500">
            内定フォロー担当
            <select
              value={ownerId}
              onChange={(e) => void saveOwner(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
            >
              <option value={0}>未設定</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500">
            申請種別
            <select
              value={appType}
              onChange={(e) => setAppType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
            >
              <option value="">未設定</option>
              {APPLICATION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="col-span-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
            <span>内定承諾 {fmt(card.offerAcceptedAt)}</span>
            <span className={!card.applicationAt && isOver(card.applicationPlannedAt) ? "text-red-600" : ""}>
              申請予定 {fmt(card.applicationPlannedAt)}（内定+10日）
            </span>
            <span>申請 {fmt(card.applicationAt)}</span>
            <span className={!card.joinAt && isOver(card.joinPlannedAt) ? "text-red-600" : ""}>
              入社予定 {fmt(card.joinPlannedAt)}（内定+2か月）
            </span>
          </div>
        </div>

        {/* 次にやること */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">次にやること</p>
          <textarea
            className="mt-2 min-h-14 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            <button
              type="button"
              onClick={() => void createTasks(card.tasks.length > 0)}
              disabled={busy}
              className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] disabled:opacity-50"
            >
              {card.tasks.length === 0 ? "チェックリストを作成" : "申請種別で作り直す"}
            </button>
          </div>
          {card.tasks.length === 0 ? (
            <p className="mt-2 text-[12px] text-gray-500">
              申請種別（認定 / 変更 / 更新 / 特定活動）を選んで作成すると、その種別に必要な書類と手順が並びます。
              期限は内定承諾日から自動計算されます。
            </p>
          ) : null}
          <div className="mt-3 space-y-4">
            {categories.map((category) => (
              <div key={category}>
                <p className="text-[11px] font-semibold text-gray-400">{category}</p>
                <ul className="mt-1 space-y-1">
                  {card.tasks
                    .filter((t) => t.category === category)
                    .map((t) => (
                      <li key={t.id} className="flex items-start gap-2 rounded-lg px-1 py-0.5 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={Boolean(t.doneAt)}
                          onChange={() => void toggleTask(t)}
                          className="mt-0.5 accent-[var(--color-primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] ${t.doneAt ? "text-gray-400 line-through" : "text-gray-800"}`}
                          >
                            {t.title}
                          </span>
                          <span
                            className={`text-[10px] ${
                              !t.doneAt && isOver(t.dueAt) ? "font-semibold text-red-600" : "text-gray-400"
                            }`}
                          >
                            {t.dueAt ? `期限 ${fmt(t.dueAt)}` : "期限なし"}
                            {!t.doneAt && isOver(t.dueAt) ? " ・超過" : ""}
                            {t.doneAt ? ` ・完了 ${fmt(t.doneAt)}${t.doneBy ? ` (${t.doneBy})` : ""}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 問題 */}
        <div className="px-6 py-4">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">起きた問題・クレーム</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            未解決があるとカードが赤になります。保留列へ移すときの理由にもなります。
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
