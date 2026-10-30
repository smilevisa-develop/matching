"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import {
  APPLICATION_TYPES,
  DECLINED_STAGE,
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
  /** 担当者 (請求のタスク: 企業の担当者) */
  owner?: string | null;
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
  /** 表示名 (アルファベットの英語名。無ければカナ名) */
  personName: string;
  /** カナ名 (英語名を出しているときだけ。詳細の吹き出しで併記) */
  kanaName: string | null;
  nationality: string;
  photoUrl: string | null;
  partnerName: string | null;
  residenceStatus: string;
  /** 在留期限 (YYYY-MM-DD。無ければ空) */
  visaExpiryDate: string;
  companyName: string | null;
  /** 候補者とは別に追加した内定者 */
  external: boolean;
  /** 書類作成のみを請け負った内定者 (薄く色を付けて出す) */
  documentsOnly: boolean;
  /** 内定者の Drive フォルダ (企業フォルダ / 内定者 / 英語名)。まだ無ければ null */
  driveFolderUrl: string | null;
  /** 本人の SNS の連絡先 URL (LINE / Messenger など)。未登録なら null */
  contactUrl?: string | null;
  /** 連絡手段 (LINE / Messenger / WhatsApp)。未設定なら null */
  channel?: string | null;
  /** 委託管理の企業の内定者 (ボードには出さない) */
  outsourced: boolean;
  ownerId: number | null;
  ownerName: string | null;
  stage: OnboardingStageId;
  memo: string;
  holdReason: string;
  /** キャンセルにした理由 */
  cancelReason: string;
  /** 内定辞退の理由 (内定辞退にするとボードから消える) */
  declineReason?: string;
  /** YYYY-MM-DD (未申請は空) */
  applicationAt: string;
  offerAcceptedAt: string;
  /** 一時帰国 (有 / 無。未入力は空) と一時帰国日 */
  returnHomeFlag?: string;
  returnHomeAt?: string;
  /** 入国予定日 / 入国日 / 入社予定日 / 入社日 (YYYY-MM-DD。未入力は空) */
  entryPlannedAt?: string;
  entryAt: string;
  joinPlannedAt: string;
  joinAt: string;
  /** 認定 / 変更 / 更新 / 特定活動 (未設定は空) */
  applicationType: string;
  /** 申請方法 (短文) */
  applicationMethod: string;
  /** 選んだサポート (SUPPORT_OPTIONS の id) */
  supports: string[];
  tasks: OnboardingTask[];
  issues: OnboardingIssue[];
};

type Staff = { id: number; name: string; loginId: string };

/** 内定者フォローの担当 (追加するときの最初の担当。内定承諾で自動で載るときと同じ) */
const DEFAULT_FOLLOW_UP_LOGIN_ID = "nguyet";

// 列の id は lib/onboarding-flow.ts と同じ。見出しだけ短くしている
const COLUMNS: { id: OnboardingStageId; label: string }[] = [
  { id: "offer", label: "内定" },
  { id: "documents", label: "書類集め" },
  { id: "prepare", label: "申請準備" },
  { id: "applying", label: "申請中" },
  { id: "card_processing", label: "在留カード発行手続き中" },
  { id: "card_issued", label: "発行完了" },
  { id: "card_cancelled", label: "キャンセル" },
  { id: "support", label: "サポート" },
  { id: "joined", label: "入社" },
  { id: "billing", label: "請求" },
  { id: "hold", label: "保留" },
];

/** キャンセルの列 (入れるときに理由を書くポップが出る) */
const CANCEL_STAGE: OnboardingStageId = "card_cancelled";

/** 在留期限までの日数と色。赤 = 30 日以内 (切れている)、黄 = 90 日以内 */
export function visaAlert(ymd: string): { days: number; level: "red" | "yellow" | "none" } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
  const days = Math.round((new Date(ymd).getTime() - today.getTime()) / 86_400_000);
  return { days, level: days <= 30 ? "red" : days <= 90 ? "yellow" : "none" };
}
const VISA_RANK = { red: 0, yellow: 1, none: 2 } as const;
/**
 * 在留期限を出す工程 = 新しい在留カードがまだ出ていない人だけ。
 * 発行完了より後 (サポート・入社) の人の在留期限は申請前の古いカードのもので、出すと間違えるため出さない
 */
const VISA_STAGES = new Set<string>(["offer", "documents", "prepare", "applying", "card_processing", "hold"]);
const visaOf = (card: OnboardingCard) => (VISA_STAGES.has(card.stage) ? card.visaExpiryDate : "");
/** 在留期限が近い人を上に (赤 → 黄 → そのほか。同じ色の中は期限の近い順、そのほかは元の順) */
function byVisaUrgency(list: OnboardingCard[]): OnboardingCard[] {
  return list
    .map((c, i) => ({ c, i, a: visaAlert(visaOf(c)) }))
    .sort((x, y) => {
      const rx = VISA_RANK[x.a?.level ?? "none"];
      const ry = VISA_RANK[y.a?.level ?? "none"];
      if (rx !== ry) return rx - ry;
      if (rx < 2) return (x.a?.days ?? 0) - (y.a?.days ?? 0);
      return x.i - y.i;
    })
    .map((x) => x.c);
}

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
  if (card.stage === CANCEL_STAGE && card.cancelReason) return `キャンセル: ${card.cancelReason}`;
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
      owner: typeof o.owner === "string" ? o.owner : null,
    };
  });
}

export default function OnboardingBoard({
  initialCards,
  staff,
  initialOpenId = null,
}: {
  initialCards: OnboardingCard[];
  staff: Staff[];
  initialOpenId?: number | null;
}) {
  const [cards, setCards] = useState(initialCards);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<OnboardingStageId | null>(null);
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [showOutsourced, setShowOutsourced] = useState(false);
  const [adding, setAdding] = useState(false);
  // 保留 / サポートに入れるときのポップ (移動先が決まってから保存する)
  const [pendingHold, setPendingHold] = useState<number | null>(null);
  const [pendingCancel, setPendingCancel] = useState<number | null>(null);
  const [pendingDecline, setPendingDecline] = useState<number | null>(null);
  // 入社の列に入れるときは必ず、請求の列は入社日が無ければ、入社日を聞く (請求のタスクは入社日から作るため)
  const [pendingJoin, setPendingJoin] = useState<{ id: number; stage: JoinStage } | null>(null);
  const [pendingSupport, setPendingSupport] = useState<number | null>(null);

  // 内定辞退にした人はボードから消す
  const visible = cards.filter((c) => c.stage !== DECLINED_STAGE && (showOutsourced || !c.outsourced));
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
      if (patch.stage === CANCEL_STAGE) body.cancelReason = patch.cancelReason ?? card.cancelReason;
      if (patch.stage === DECLINED_STAGE) body.declineReason = patch.declineReason ?? "";
    }
    if (patch.holdReason !== undefined && patch.stage === undefined) body.holdReason = patch.holdReason;
    if (patch.cancelReason !== undefined && patch.stage === undefined) body.cancelReason = patch.cancelReason;
    if (patch.ownerId !== undefined) body.followUpOwnerId = patch.ownerId;
    if (patch.memo !== undefined) body.currentAction = patch.memo;
    if (patch.applicationAt !== undefined) body.applicationAt = patch.applicationAt || null;
    if (patch.returnHomeFlag !== undefined) body.returnHomeFlag = patch.returnHomeFlag || null;
    if (patch.returnHomeAt !== undefined) body.returnHomeAt = patch.returnHomeAt || null;
    if (patch.entryPlannedAt !== undefined) body.entryPlannedAt = patch.entryPlannedAt || null;
    if (patch.entryAt !== undefined) body.entryAt = patch.entryAt || null;
    if (patch.joinPlannedAt !== undefined) body.joinPlannedAt = patch.joinPlannedAt || null;
    if (patch.joinAt !== undefined) body.joinAt = patch.joinAt || null;
    if (patch.offerAcceptedAt !== undefined) body.offerAcceptedAt = patch.offerAcceptedAt || null;
    if (patch.applicationType !== undefined) body.applicationType = patch.applicationType || null;
    if (patch.applicationMethod !== undefined) body.applicationMethod = patch.applicationMethod || null;
    if (patch.documentsOnly !== undefined) body.documentsOnly = patch.documentsOnly;
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

  /** 列へ移す。保留・キャンセル・サポートは先にポップを出す */
  const moveTo = (card: OnboardingCard, stage: OnboardingStageId) => {
    if (card.stage === stage) return;
    if (stage === HOLD_STAGE) setPendingHold(card.id);
    else if (stage === CANCEL_STAGE) setPendingCancel(card.id);
    else if (stage === DECLINED_STAGE) setPendingDecline(card.id);
    else if (stage === "joined" || (stage === "billing" && !card.joinAt)) setPendingJoin({ id: card.id, stage });
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

  /** 間違えて追加したカードを消す (候補者本体・カンバンは残る) */
  const removeCard = async (card: OnboardingCard) => {
    const res = await fetch(apiPath(card), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`削除に失敗しました: ${data.error ?? res.statusText}`);
      return;
    }
    setOpenId(null);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  };

  const openCard = cards.find((c) => c.id === openId) ?? null;
  const holdCard = cards.find((c) => c.id === pendingHold) ?? null;
  const cancelCard = cards.find((c) => c.id === pendingCancel) ?? null;
  const declineCard = cards.find((c) => c.id === pendingDecline) ?? null;
  const joinCard = cards.find((c) => c.id === pendingJoin?.id) ?? null;
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
              {showOutsourced ? `委託管理・人材紹介会社 ${outsourcedCount} 名を隠す` : `委託管理・人材紹介会社 ${outsourcedCount} 名は非表示`}
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
          const list = byVisaUrgency(visible.filter((c) => c.stage === col.id));
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

      {/* 下の段: 保留 (横向き) と、右下に小さく「内定辞退」の入れ口 */}
      <div className="mt-3 flex items-stretch gap-3">
      {/* 保留: 工程から外れている人を一目で拾えるよう、下に横向きで置く */}
      {(() => {
        const list = byVisaUrgency(visible.filter((c) => c.stage === HOLD_STAGE));
        const dragging = cards.find((c) => c.id === draggingId);
        const isTarget = Boolean(dragging) && overStage === HOLD_STAGE && dragging?.stage !== HOLD_STAGE;
        return (
          <div
            {...dropHandlers(HOLD_STAGE)}
            className={`min-w-0 flex-1 rounded-2xl border p-3 transition-all duration-150 ${
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

      {/* 内定辞退: ここに入れると理由を聞いて、ボードから消す (カンバンの候補者も内定辞退になる) */}
      {(() => {
        const isTarget = Boolean(draggingId) && overStage === DECLINED_STAGE;
        return (
          <div
            {...dropHandlers(DECLINED_STAGE)}
            className={`flex w-[150px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-3 py-3 text-center transition-all duration-150 ${
              isTarget ? "scale-[1.03] border-red-500 bg-red-50 text-red-700" : "border-gray-300 bg-white text-gray-400"
            }`}
          >
            <p className="text-sm font-semibold">内定辞退</p>
            <p className="mt-1 text-[10px] leading-snug">ここに入れると理由を聞いて、ボードから消します</p>
          </div>
        );
      })()}
      </div>

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
          onDelete={() => removeCard(openCard)}
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

      {cancelCard ? (
        <ReasonModal
          title={`${cancelCard.personName} をキャンセルにする`}
          label="キャンセルの理由 (カードに出ます)"
          placeholder="例: 不許可。本人が辞退。企業が内定取り消し"
          submitLabel="キャンセルにする"
          initial={cancelCard.cancelReason}
          onCancel={() => setPendingCancel(null)}
          onConfirm={(reason) => {
            setPendingCancel(null);
            void save(cancelCard.id, { stage: CANCEL_STAGE, cancelReason: reason });
          }}
        />
      ) : null}

      {joinCard && pendingJoin ? (
        <JoinDateModal
          card={joinCard}
          stage={pendingJoin.stage}
          onCancel={() => setPendingJoin(null)}
          onConfirm={(joinAt) => {
            setPendingJoin(null);
            void save(joinCard.id, { stage: pendingJoin.stage, joinAt });
          }}
        />
      ) : null}

      {declineCard ? (
        <ReasonModal
          title={`${declineCard.personName} を内定辞退にする`}
          label="内定辞退の理由 (このボードからは消えます。カンバンの候補者も「内定辞退」になります)"
          placeholder="例: 家族の事情で帰国。他社に決めた。給与条件が合わない"
          submitLabel="内定辞退にする"
          initial=""
          onCancel={() => setPendingDecline(null)}
          onConfirm={(reason) => {
            setPendingDecline(null);
            if (openId === declineCard.id) setOpenId(null);
            void save(declineCard.id, { stage: DECLINED_STAGE, declineReason: reason });
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
  // カーソルを合わせて少し待つと詳細を大きく出す (候補者カンバンと同じ)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const endHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHoverRect(null);
  };

  return (
    <>
    <button
      type="button"
      draggable
      onDragStart={() => {
        endHover();
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        endHover();
        onClick();
      }}
      onMouseEnter={(event) => {
        if (dragging) return;
        const el = event.currentTarget;
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => setHoverRect(el.getBoundingClientRect()), 250);
      }}
      onMouseLeave={endHover}
      className={`w-full cursor-grab rounded-xl border p-3 text-left shadow-sm hover:shadow-md ${
        card.documentsOnly ? "border-violet-200 bg-violet-50" : "border-gray-200 bg-white"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">
          {card.personName}
          {card.documentsOnly ? <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-normal text-violet-700">書類のみ</span> : null}
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
      <VisaBadge ymd={visaOf(card)} />
      {next ? (
        <p className={`mt-1.5 line-clamp-2 text-xs ${
            card.stage === HOLD_STAGE ? "font-medium text-amber-700" : card.stage === CANCEL_STAGE ? "font-medium text-red-700" : "text-gray-700"
          }`}>{next}</p>
      ) : complete ? (
        <p className="mt-1.5 text-xs text-emerald-700">この工程は完了。次へ進めます</p>
      ) : null}
    </button>
    {hoverRect && !dragging ? <BoardHoverCard card={card} rect={hoverRect} next={next} done={done} total={stageTasks.length} /> : null}
    </>
  );
}

/** カードにカーソルを合わせたときに出す、大きめの内定者情報 (空の項目は出さない) */
function BoardHoverCard({ card, rect, next, done, total }: { card: OnboardingCard; rect: DOMRect; next: string | null; done: number; total: number }) {
  const width = 300;
  // カードの右に出す。画面の右端からはみ出すときは左に出す
  const left = rect.right + 8 + width > window.innerWidth ? Math.max(8, rect.left - width - 8) : rect.right + 8;
  // 下にはみ出さないよう、画面の下の方では上にずらす
  const top = Math.min(Math.max(8, rect.top - 8), window.innerHeight - 380);
  const stageLabel = COLUMNS.find((c) => c.id === card.stage)?.label ?? card.stage;
  const supportLabels = SUPPORT_OPTIONS.filter((o) => card.supports.includes(o.id)).map((o) => o.label);
  const rows: [string, string | null][] = [
    ["企業", card.companyName],
    ["工程", total > 0 ? `${stageLabel}（${done}/${total}）` : stageLabel],
    ["担当", card.ownerName],
    ["国籍", card.nationality || null],
    ["在留資格", card.residenceStatus || null],
    ["在留期限", visaOf(card) ? visaOf(card).replaceAll("-", "/") : null],
    ["申請種別", card.applicationType || null],
    ["申請方法", card.applicationMethod || null],
    ["内定承諾日", card.offerAcceptedAt ? card.offerAcceptedAt.replaceAll("-", "/") : null],
    ["申請日", card.applicationAt ? card.applicationAt.replaceAll("-", "/") : null],
    ["入社予定日", card.joinPlannedAt && !card.joinAt ? card.joinPlannedAt.replaceAll("-", "/") : null],
    ["入社日", card.joinAt ? card.joinAt.replaceAll("-", "/") : null],
    ["サポート", supportLabels.length > 0 ? supportLabels.join("・") : null],
    ["パートナー", card.partnerName],
    card.stage === HOLD_STAGE
      ? ["保留理由", card.holdReason || null]
      : card.stage === CANCEL_STAGE
        ? ["キャンセル理由", card.cancelReason || null]
        : [card.memo ? "メモ" : "次にやること", next],
  ];
  return (
    <div className="pointer-events-none fixed z-[70] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl" style={{ left, top, width }}>
      <div className="flex items-center gap-3">
        <PersonAvatar photoUrl={card.photoUrl} name={card.personName} size={56} className="shrink-0 rounded-xl" />
        <div className="min-w-0">
          {card.personId ? (
            <p className="text-xs font-semibold text-[var(--color-primary)]">ID {String(card.personId).padStart(3, "0")}</p>
          ) : (
            <p className="text-xs text-gray-500">書類作成のみ</p>
          )}
          <p className="text-base font-bold leading-snug text-[var(--color-text-dark)]">{card.personName}</p>
          {card.kanaName ? <p className="text-sm text-gray-600">{card.kanaName}</p> : null}
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-20 shrink-0 text-gray-500">{k}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-gray-800">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/** 本人の SNS (LINE / Facebook など) を開くボタン。未登録なら薄く出して、押せない */
const SNS_COLORS: Record<string, string> = { LINE: "#06C755", Messenger: "#0866FF", Facebook: "#0866FF", WhatsApp: "#25D366" };
function SnsButton({ card }: { card: OnboardingCard }) {
  const url = card.contactUrl ?? null;
  const color = url ? SNS_COLORS[card.channel ?? ""] ?? "var(--color-primary)" : undefined;
  const icon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.8-4.6A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  );
  if (!url) {
    return (
      <span
        title={card.personId ? "SNS の連絡先が未登録です (候補者詳細の「連絡手段」で登録できます)" : "SNS の連絡先は未登録です"}
        className="shrink-0 cursor-not-allowed rounded-md p-1 text-gray-300"
      >
        {icon}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`本人の SNS を開く${card.channel ? ` (${card.channel})` : ""}`}
      aria-label="本人の SNS を開く"
      className="shrink-0 rounded-md p-1 hover:bg-gray-100"
      style={{ color }}
    >
      {icon}
    </a>
  );
}

/** 内定者の Drive フォルダを開くボタン (企業フォルダ / 内定者 / 英語名)。まだ無ければ作ってから開く */
function FolderButton({ card, onLocal }: { card: OnboardingCard; onLocal: (patch: Partial<OnboardingCard>) => void }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (card.driveFolderUrl) {
      window.open(card.driveFolderUrl, "_blank", "noopener");
      return;
    }
    // 作るのを待つ間にポップアップが止められないよう、先にタブを開いておく
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await fetch(apiPath(card), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensureFolder" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.folderUrl) {
        tab?.close();
        alert(`フォルダを用意できませんでした: ${data.error ?? res.statusText}`);
        return;
      }
      onLocal({ driveFolderUrl: data.folderUrl });
      if (tab) tab.location.href = data.folderUrl;
      else window.open(data.folderUrl, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      title={card.driveFolderUrl ? "内定者フォルダを開く" : "内定者フォルダを作って開く"}
      aria-label="内定者フォルダを開く"
      className="shrink-0 rounded-md p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
      </svg>
    </button>
  );
}

/** 在留期限の表示。90 日以内は黄、30 日以内・切れていれば赤で目立たせる */
function VisaBadge({ ymd }: { ymd: string }) {
  const a = visaAlert(ymd);
  if (!a) return null;
  const date = ymd.replaceAll("-", "/");
  if (a.level === "none") return <p className="mt-1 text-[11px] text-gray-400">在留期限 {date}</p>;
  const left = a.days < 0 ? "期限切れ" : a.days === 0 ? "今日まで" : `あと ${a.days} 日`;
  return (
    <p
      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        a.level === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
      }`}
    >
      在留期限 {date}（{left}）
    </p>
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
  onDelete,
}: {
  card: OnboardingCard;
  staff: Staff[];
  onDelete: () => Promise<void>;
  onClose: () => void;
  onSave: (patch: Partial<OnboardingCard>) => void;
  onLocal: (patch: Partial<OnboardingCard>) => void;
  onMove: (stage: OnboardingStageId) => void;
  onPickSupports: () => void;
}) {
  const [memo, setMemo] = useState(card.memo);
  const [holdReason, setHoldReason] = useState(card.holdReason);
  const [cancelReason, setCancelReason] = useState(card.cancelReason);
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
              <div className="flex items-center gap-2">
              {card.personId ? (
                <Link href={`/personnel/${card.personId}/edit`} className="text-lg font-bold text-[var(--color-text-dark)] hover:underline">
                  {card.personName}
                </Link>
              ) : (
                <p className="text-lg font-bold text-[var(--color-text-dark)]">{card.personName}</p>
              )}
              <FolderButton card={card} onLocal={onLocal} />
              <SnsButton card={card} />
              </div>
              {card.personId ? null : (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-500">候補者とは別</span>
              )}
              {card.kanaName ? <p className="text-sm text-gray-600">{card.kanaName}</p> : null}
              <p className="truncate text-xs text-gray-500">{[card.companyName, card.residenceStatus].filter(Boolean).join(" ・ ")}</p>
              <VisaBadge ymd={visaOf(card)} />
              <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-violet-700">
                <input type="checkbox" checked={card.documentsOnly} onChange={(e) => onSave({ documentsOnly: e.target.checked })} />
                書類作成のみ
              </label>
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

          {/* キャンセルの理由 (キャンセル中だけ) */}
          {card.stage === CANCEL_STAGE ? (
            <section className="border-b border-red-100 bg-red-50 px-5 py-3">
              <label className="block text-xs font-semibold text-red-800">
                キャンセルの理由
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  onBlur={() => cancelReason.trim() !== card.cancelReason && onSave({ cancelReason: cancelReason.trim() })}
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
              <label className="text-xs text-gray-500">
                一時帰国
                <select value={card.returnHomeFlag ?? ""} onChange={(e) => onSave({ returnHomeFlag: e.target.value })} className={`mt-1 w-full ${field}`}>
                  <option value="">未入力</option>
                  <option value="有">有</option>
                  <option value="無">無</option>
                  {card.returnHomeFlag && !["有", "無"].includes(card.returnHomeFlag) ? <option value={card.returnHomeFlag}>{card.returnHomeFlag}</option> : null}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                一時帰国日
                <input
                  type="date"
                  value={card.returnHomeAt ?? ""}
                  disabled={card.returnHomeFlag === "無"}
                  onChange={(e) => onSave({ returnHomeAt: e.target.value })}
                  className={`mt-1 w-full ${field} disabled:bg-gray-100 disabled:text-gray-400`}
                />
              </label>
              <label className="text-xs text-gray-500">
                入国予定日
                <input type="date" value={card.entryPlannedAt ?? ""} onChange={(e) => onSave({ entryPlannedAt: e.target.value })} className={`mt-1 w-full ${field}`} />
              </label>
              <label className="text-xs text-gray-500">
                入国日
                <input type="date" value={card.entryAt} onChange={(e) => onSave({ entryAt: e.target.value })} className={`mt-1 w-full ${field}`} />
              </label>
              <label className="text-xs text-gray-500">
                入社予定日
                <input type="date" value={card.joinPlannedAt} onChange={(e) => onSave({ joinPlannedAt: e.target.value })} className={`mt-1 w-full ${field}`} />
              </label>
              <label className="text-xs text-gray-500">
                入社日
                <input type="date" value={card.joinAt} onChange={(e) => onSave({ joinAt: e.target.value })} className={`mt-1 w-full ${field}`} />
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

          {/* 間違えて追加したカードを消す */}
          <section className="border-t border-gray-100 px-5 py-4 text-right">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `${card.personName} のカードを内定者管理から削除します。チェックリストとメモも消えます (候補者本体とカンバンは残ります)。\nよろしいですか？`,
                  )
                )
                  return;
                setBusy(true);
                void onDelete().finally(() => setBusy(false));
              }}
              className="text-xs text-red-600 underline decoration-dotted hover:text-red-700 disabled:opacity-50"
            >
              このカードを削除（間違えて追加したとき）
            </button>
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
          <span className={`block min-w-0 flex-1 text-sm leading-snug ${task.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
            {task.title}
            {task.owner ? <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500 no-underline">{task.owner}</span> : null}
          </span>
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

type JoinStage = "joined" | "billing";

/** 入社・請求の列に入れるときに入社日を聞くポップ (請求に入れると、入社日から翌月 1 日の請求などのタスクを作る) */
function JoinDateModal({
  card,
  stage,
  onCancel,
  onConfirm,
}: {
  card: OnboardingCard;
  stage: JoinStage;
  onCancel: () => void;
  onConfirm: (joinAt: string) => void;
}) {
  // 入社予定日は入れない (確定した入社日を、その場で入れてもらう)
  const [date, setDate] = useState(card.joinAt ?? "");
  const label = stage === "billing" ? "請求" : "入社";
  return (
    <ModalFrame title={`${card.personName} を${label}に進める`} onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (date) onConfirm(date);
        }}
      >
        <label className="mt-3 block text-xs text-gray-600">
          入社日 (確定した日)
          <input type="date" autoFocus required value={date} onChange={(e) => setDate(e.target.value)} className={MODAL_INPUT} />
        </label>
        {stage === "billing" ? (
          <p className="mt-2 text-[11px] text-gray-500">入社の翌月 1 日に請求 → その月末に入金 → パートナーへの依頼・支払い、のタスクを作ります。</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={BTN_SUB}>
            やめる
          </button>
          <button type="submit" disabled={!date} className={BTN_MAIN}>
            {label}に進める
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

/** キャンセルなど、列に入れるときに理由を書くポップ */
function ReasonModal({
  title,
  label,
  placeholder,
  submitLabel,
  initial,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  initial: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(initial);
  return (
    <ModalFrame title={title} onCancel={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          onConfirm(reason.trim());
        }}
      >
        <label className="mt-3 block text-xs text-gray-600">
          {label}
          <textarea autoFocus required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} className={MODAL_INPUT} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={BTN_SUB}>
            やめる
          </button>
          <button type="submit" disabled={!reason.trim()} className={BTN_MAIN}>
            {submitLabel}
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
  const defaultOwner = staff.find((s) => s.loginId === DEFAULT_FOLLOW_UP_LOGIN_ID);
  const [form, setForm] = useState({
    name: "",
    companyName: "",
    residenceStatus: "",
    followUpOwnerId: defaultOwner ? String(defaultOwner.id) : "",
    applicationType: "",
    applicationMethod: "",
  });
  // 書類作成のみ (最初からチェック)
  const [documentsOnly, setDocumentsOnly] = useState(true);
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
        body: JSON.stringify({ ...form, documentsOnly, followUpOwnerId: form.followUpOwnerId ? Number(form.followUpOwnerId) : null }),
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
        kanaName: null,
        nationality: "",
        photoUrl: null,
        partnerName: null,
        residenceStatus: form.residenceStatus.trim(),
        visaExpiryDate: "",
        companyName: form.companyName.trim() || null,
        external: true,
        documentsOnly,
        driveFolderUrl: null,
        outsourced: false,
        ownerId,
        ownerName: staff.find((s) => s.id === ownerId)?.name ?? null,
        stage: "offer",
        memo: "",
        holdReason: "",
        cancelReason: "",
        applicationAt: "",
        entryAt: "",
        joinPlannedAt: "",
        joinAt: "",
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
          <input value={form.applicationMethod} onChange={(e) => set("applicationMethod", e.target.value)} placeholder="例: 提出は本人" className={MODAL_INPUT} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-dark)]">
          <input type="checkbox" checked={documentsOnly} onChange={(e) => setDocumentsOnly(e.target.checked)} />
          書類作成のみ
          <span className="text-xs text-gray-400">(ボードで薄い紫で表示)</span>
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
