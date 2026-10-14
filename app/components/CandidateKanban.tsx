"use client";

import Link from "next/link";
import { useState } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import { CANDIDATE_STAGES } from "@/lib/deal-stages";

/**
 * 候補者のカンバン。企業詳細と進捗管理 (行を開いたとき) の両方で同じものを使う。
 * 列をまたいでドラッグすると onMove、カードの × で onRemove が呼ばれる (保存は呼び出し側)。
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
  内定辞退: "bg-[#9CA3AF]",
  書類NG: "bg-[#FB923C]",
  面談NG: "bg-[#EC4899]",
  不合格: "bg-[#EF4444]",
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

/** 選考中の列 (画面に広く出す)。それ以外 (内定辞退・NG・不合格) は右端に寄せる */
const ACTIVE_STAGES: string[] = ["接続済み", "事前面談済み", "推薦済み", "面接済み", "内定済み"];

export default function CandidateKanban({
  candidates,
  onMove,
  onRemove,
}: {
  candidates: CandidateCard[];
  onMove: (candidateId: number, stage: string) => void;
  /** カードの × を押したとき (このカンバンから外す。確認と保存は呼び出し側) */
  onRemove?: (candidate: CandidateCard) => void;
}) {
  const [draggingCandidateId, setDraggingCandidateId] = useState<number | null>(null);
  // いまカードを重ねている列 (ドロップ先を光らせる)
  const [overColumn, setOverColumn] = useState<string | null>(null);
  // 動かした直後のカード (一瞬だけ強調して、どこに入ったか分かるようにする)
  const [justMovedId, setJustMovedId] = useState<number | null>(null);
  const dragging = candidates.find((c) => c.id === draggingCandidateId) ?? null;

  const endDrag = () => {
    setDraggingCandidateId(null);
    setOverColumn(null);
  };

  return (
    // 選考中の 5 列 (接続済み〜内定済み) で見える幅をちょうど使い切り、
    // 内定辞退・書類NG・面談NG・不合格 は右へスクロールしたときだけ見える
    <div className="flex gap-2 overflow-x-auto pb-1">
    {CANDIDATE_STAGES.map((column) => {
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
              onMove(draggingCandidateId, column);
              setJustMovedId(draggingCandidateId);
              window.setTimeout(() => setJustMovedId(null), 1200);
            }
            endDrag();
          }}
          className={`flex max-h-[calc(100vh-18rem)] shrink-0 flex-col rounded-xl border bg-white p-2 transition-all duration-150 ${
            ACTIVE_STAGES.includes(column) ? "w-[calc((100%-2rem)/5)] min-w-[120px]" : "w-[130px]"
          } ${
            isTarget
              ? "scale-[1.02] border-[var(--color-primary)] bg-[var(--color-light)] shadow-lg ring-2 ring-[var(--color-primary)]"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5 text-gray-700">
            <h3 className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[column] ?? "bg-gray-300"}`} />
              <span className="truncate">{column}</span>
            </h3>
            <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold">
              {columnCandidates.length}
            </span>
          </div>
          <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {isTarget ? (
              <div className="rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-white/70 px-2 py-3 text-center text-[11px] font-semibold text-[var(--color-primary)]">
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
                  setDraggingCandidateId(candidate.id);
                }}
                onDragEnd={endDrag}
                className={`group relative block rounded-lg border border-gray-200 bg-white p-2 transition hover:border-gray-400 hover:shadow-sm ${
                  candidate.id === draggingCandidateId ? "opacity-40" : ""
                } ${candidate.id === justMovedId ? "ring-2 ring-[var(--color-primary)] ring-offset-1" : ""}`}
                title={`${formatCandidateLabel(candidate.person)}\n${candidate.person.name}\n${candidate.person.nationality} / ${candidate.person.residenceStatus}\n紹介パートナー: ${candidate.person.partner?.name ?? "未設定"}${candidate.note ? `\n備考: ${candidate.note}` : ""}`}
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
            {columnCandidates.length === 0 && !isTarget ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-2 py-2 text-center text-[11px] text-gray-400">
                候補者なし
              </div>
            ) : null}
          </div>
        </section>
      );
    })}
    </div>
  );
}
