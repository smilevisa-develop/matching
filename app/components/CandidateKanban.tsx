"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import { EXIT_STAGES, STAGE_DATE_LABELS, stagesForKind, todayJst } from "@/lib/deal-stages";

/**
 * 候補者のカンバン。企業詳細と進捗管理 (行を開いたとき) の両方で同じものを使う。
 * 列をまたいでドラッグすると onMove、カードの × で onRemove が呼ばれる (保存は呼び出し側)。
 *
 * 2026/10 採用チームの依頼:
 *   - すべての列を 1 画面に出す (横スクロールしないと内定辞退などへ動かせなかった)
 *   - ステージを変えるときは日付を入れる (事前面談日 / 企業面接日 / 内定日 …)。
 *     入れた日付は進捗管理の月別集計と、企業データベース (請求管理 / 内定者管理) に使う
 */

export type CandidateCard = {
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

// 色は列の見出しの丸印だけに付ける (カードや枠まで色を付けると、かえって見にくいため)
const STAGE_DOT: Record<string, string> = {
  接続済み: "bg-[#60A5FA]",
  事前面談済み: "bg-[#818CF8]",
  推薦済み: "bg-[#F59E0B]",
  面接済み: "bg-[#22D3EE]",
  内定済み: "bg-[#22C55E]",
  内定承諾: "bg-[#15803D]",
  入社待ち: "bg-[#0EA5E9]",
  入社済み: "bg-[#0F766E]",
  応募辞退: "bg-[#A8A29E]",
  内定辞退: "bg-[#9CA3AF]",
  書類NG: "bg-[#FB923C]",
  面談NG: "bg-[#EC4899]",
  選考NG: "bg-[#F97316]",
  内定取り消し: "bg-[#B91C1C]",
};

/** 候補者カード見出し用: 「001 DAO VAN HOANG」形式 (英語名がなければカナ名) */
function formatCandidateLabel(person: { id: number; name: string; englishName?: string | null }): string {
  const prefix = String(person.id).padStart(3, "0");
  const label = person.englishName?.trim() || person.name;
  return `${prefix} ${label}`;
}

/** カンバンから外す前の確認。カードで数えた人数も戻ることを伝える */
export function confirmRemoveCandidate(candidate: CandidateCard): boolean {
  const counted = !["接続済み", "事前面談済み", "面談NG"].includes(candidate.stage);
  return window.confirm(
    `${formatCandidateLabel(candidate.person)} をこのカンバンから外します（候補者本体は残ります）。` +
      (counted ? `\n今のステータス「${candidate.stage}」で数えた推薦・面接・内定などの人数も戻ります。` : ""),
  );
}

/** カンバンから外す (保存)。成功したら更新後の人数カウンターを返す */
export async function removeCandidateFromKanban(candidateId: number) {
  const res = await fetch(`/api/deal-candidates/${candidateId}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || "外せませんでした");
    return null;
  }
  return data.counters as Record<string, number>;
}

export default function CandidateKanban({
  candidates,
  onMove,
  onRemove,
  companyKind = "通常",
  layout = "split",
}: {
  candidates: CandidateCard[];
  /**
   * 列の並べ方。
   *   split   … 2 段組。上の段に進行中の列、下の段に辞退・取り消し・NG (企業詳細)
   *   compact … 進行中の列を広くとり、辞退・取り消し・NGは右側に 2 段に重ねる (進捗管理の表の中)
   */
  layout?: "split" | "compact";
  /** 企業の区分。人材紹介会社なら 内定 → 入社待ち → 入社済み の列になる */
  companyKind?: string;
  /** 列をまたいで動かしたとき。date は入力した日付 (YYYY-MM-DD)。日付を聞かない列なら null */
  onMove: (candidateId: number, stage: string, date: string | null) => void;
  /** カードの × を押したとき (このカンバンから外す。確認と保存は呼び出し側) */
  onRemove?: (candidate: CandidateCard) => void;
}) {
  const [draggingCandidateId, setDraggingCandidateId] = useState<number | null>(null);
  // いまカードを重ねている列 (ドロップ先を光らせる)
  const [overColumn, setOverColumn] = useState<string | null>(null);
  // 動かした直後のカード (一瞬だけ強調して、どこに入ったか分かるようにする)
  const [justMovedId, setJustMovedId] = useState<number | null>(null);
  // 日付の入力待ち (ドロップした直後。保存は日付を入れてから)
  const [pending, setPending] = useState<{ candidateId: number; stage: string; date: string } | null>(null);
  const dragging = candidates.find((c) => c.id === draggingCandidateId) ?? null;

  const endDrag = () => {
    setDraggingCandidateId(null);
    setOverColumn(null);
  };

  const commitMove = (candidateId: number, stage: string, date: string | null) => {
    onMove(candidateId, stage, date);
    setJustMovedId(candidateId);
    window.setTimeout(() => setJustMovedId(null), 1200);
  };

  const pendingCandidate = pending ? candidates.find((c) => c.id === pending.candidateId) ?? null : null;

  // カードにカーソルを合わせたときの詳細 (文字が小さいので、大きく出す)
  const [hover, setHover] = useState<{ candidate: CandidateCard; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const startHover = (candidate: CandidateCard, el: HTMLElement) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHover({ candidate, rect: el.getBoundingClientRect() }), 250);
  };
  const endHover = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHover(null);
  };

  const stages = stagesForKind(companyKind);
  const exitSet = new Set(EXIT_STAGES);
  const activeColumns = stages.filter((s) => !exitSet.has(s));
  const exitColumns = stages.filter((s) => exitSet.has(s));

  return (
    <>
    {(() => {
      const renderColumn = (column: string, sizeClass: string) => {
      const columnCandidates = candidates.filter((candidate) => candidate.stage === column);
      const isTarget = dragging !== null && overColumn === column && dragging.stage !== column;
      return (
        <section
          key={column}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (overColumn !== column) setOverColumn(column);
          }}
          onDragLeave={(event) => {
            // 列の中の子要素へ移っただけなら、光らせたままにする
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setOverColumn((cur) => (cur === column ? null : cur));
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingCandidateId && dragging?.stage !== column) {
              if (STAGE_DATE_LABELS[column]) {
                // 日付を聞く列: 入力してから保存する
                setPending({ candidateId: draggingCandidateId, stage: column, date: todayJst() });
              } else {
                commitMove(draggingCandidateId, column, null);
              }
            }
            endDrag();
          }}
          className={`flex min-w-0 flex-col rounded-xl border bg-white p-1.5 transition-all duration-150 ${sizeClass} ${
            isTarget
              ? "scale-[1.02] border-[var(--color-primary)] bg-[var(--color-light)] shadow-lg ring-2 ring-[var(--color-primary)]"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between gap-1 rounded-lg bg-gray-50 px-1.5 py-1.5 text-gray-700" title={column}>
            <h3 className="flex min-w-0 items-center gap-1 text-[11px] font-semibold">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[column] ?? "bg-gray-300"}`} />
              <span className="truncate">{column}</span>
            </h3>
            <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold">
              {columnCandidates.length}
            </span>
          </div>
          <div className="mt-1.5 flex-1 space-y-1.5 overflow-y-auto">
            {isTarget ? (
              <div className="rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-white/70 px-1 py-3 text-center text-[11px] font-semibold text-[var(--color-primary)]">
                ここに移動
              </div>
            ) : null}
            {columnCandidates.map((candidate) => (
              <Link
                key={candidate.id}
                href={`/personnel/${candidate.person.id}/edit`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  endHover();
                  setDraggingCandidateId(candidate.id);
                }}
                onDragEnd={endDrag}
                onMouseEnter={(event) => {
                  if (!draggingCandidateId) startHover(candidate, event.currentTarget);
                }}
                onMouseLeave={endHover}
                className={`group relative block rounded-lg border border-gray-200 bg-white p-1.5 transition hover:border-gray-400 hover:shadow-sm ${
                  candidate.id === draggingCandidateId ? "opacity-40" : ""
                } ${candidate.id === justMovedId ? "ring-2 ring-[var(--color-primary)] ring-offset-1" : ""}`}
              >
                {onRemove ? (
                  <button
                    type="button"
                    aria-label="このカンバンから外す"
                    title="このカンバンから外す"
                    onClick={(event) => {
                      // カードはリンクなので、押したときに候補者詳細へ飛ばないようにする
                      event.preventDefault();
                      event.stopPropagation();
                      onRemove(candidate);
                    }}
                    className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] leading-none text-gray-400 shadow-sm hover:bg-red-50 hover:text-red-600 group-hover:flex"
                  >
                    ✕
                  </button>
                ) : null}
                <div className="flex items-start gap-1">
                  <PersonAvatar
                    photoUrl={candidate.person.photoUrl}
                    name={candidate.person.name}
                    size={24}
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
            {columnCandidates.length === 0 && !isTarget ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-1 py-2 text-center text-[11px] text-gray-400">
                なし
              </div>
            ) : null}
          </div>
        </section>
      );
      };
      return layout === "compact" ? (
        // 進捗管理: 進行中の列を広く、辞退・取り消し・NGは右側に 2 段 (3 列 × 2 段) に重ねる
        <div className="flex gap-1.5 pb-1">
          <div className="flex min-w-0 flex-[2] gap-1.5">
            {activeColumns.map((c) => renderColumn(c, "max-h-[calc(100vh-18rem)] flex-1 basis-0"))}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-3 grid-rows-2 gap-1.5">
            {exitColumns.map((c) => renderColumn(c, "max-h-[11rem] min-h-[6rem]"))}
          </div>
        </div>
      ) : (
        // 企業詳細: 2 段組。上の段に進行中の列 (広く)、下の段に辞退・取り消し・NG
        <div className="space-y-1.5 pb-1">
          <div className="flex gap-1.5">{activeColumns.map((c) => renderColumn(c, "max-h-[calc(100vh-24rem)] min-h-[10rem] flex-1 basis-0"))}</div>
          <div className="flex gap-1.5">{exitColumns.map((c) => renderColumn(c, "max-h-[14rem] min-h-[6rem] flex-1 basis-0"))}</div>
        </div>
      );
    })()}

    {hover && !draggingCandidateId ? <HoverCard candidate={hover.candidate} rect={hover.rect} /> : null}

    {pending && pendingCandidate ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setPending(null)}>
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending.date) return;
            commitMove(pending.candidateId, pending.stage, pending.date);
            setPending(null);
          }}
          className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        >
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">
            {formatCandidateLabel(pendingCandidate.person)} → {pending.stage}
          </p>
          <label className="mt-4 block text-xs font-medium text-gray-600">
            {STAGE_DATE_LABELS[pending.stage] ?? "日付"}
            <input
              type="date"
              autoFocus
              required
              value={pending.date}
              onChange={(e) => setPending((cur) => (cur ? { ...cur, date: e.target.value } : cur))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <p className="mt-2 text-[11px] text-gray-400">
            この日付で進捗管理の月の数字と、企業データベース (請求管理 / 内定者管理) に反映します。
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              やめる
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    ) : null}
    </>
  );
}

/** カードにカーソルを合わせたときに出す、大きめの候補者情報 */
function HoverCard({ candidate, rect }: { candidate: CandidateCard; rect: DOMRect }) {
  const width = 280;
  // カードの右に出す。画面の右端からはみ出すときは左に出す
  const left = rect.right + 8 + width > window.innerWidth ? Math.max(8, rect.left - width - 8) : rect.right + 8;
  // 下にはみ出さないよう、画面の下の方では上にずらす (カードの高さは 300px 前後)
  const top = Math.min(Math.max(8, rect.top - 8), window.innerHeight - 320);
  const p = candidate.person;
  return (
    <div
      className="pointer-events-none fixed z-[70] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl"
      style={{ left, top, width }}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar photoUrl={p.photoUrl} name={p.name} size={56} className="shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--color-primary)]">ID {String(p.id).padStart(3, "0")}</p>
          <p className="text-base font-bold leading-snug text-[var(--color-text-dark)]">{p.englishName?.trim() || p.name}</p>
          {p.englishName?.trim() ? <p className="text-sm text-gray-600">{p.name}</p> : null}
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">ステータス</dt>
          <dd className="font-semibold text-[var(--color-text-dark)]">{candidate.stage}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">国籍</dt>
          <dd className="text-gray-800">{p.nationality}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">在留資格</dt>
          <dd className="text-gray-800">{p.residenceStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">パートナー</dt>
          <dd className="text-gray-800">{p.partner?.name ?? "未設定"}</dd>
        </div>
        {candidate.note ? (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-gray-500">備考</dt>
            <dd className="whitespace-pre-wrap text-gray-800">{candidate.note}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
