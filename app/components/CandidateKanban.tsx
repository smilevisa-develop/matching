"use client";

import Link from "next/link";
import { useState } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import { CANDIDATE_STAGES } from "@/lib/deal-stages";

/**
 * 候補者のカンバン。企業詳細と進捗管理 (行を開いたとき) の両方で同じものを使う。
 * 列をまたいでドラッグすると onMove が呼ばれる (保存は呼び出し側)。
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
  面接済み: {
    border: "border-[#A5F3FC]",
    head: "bg-[#CFFAFE] text-[#0E7490]",
    tile: "bg-[#ECFEFF] border-[#A5F3FC] hover:border-[#22D3EE]",
  },
  内定辞退: {
    border: "border-[#E5E7EB]",
    head: "bg-[#F3F4F6] text-[#4B5563]",
    tile: "bg-[#F9FAFB] border-[#E5E7EB] hover:border-[#9CA3AF]",
  },
  不合格: {
    border: "border-[#FECACA]",
    head: "bg-[#FEE2E2] text-[#B91C1C]",
    tile: "bg-[#FEF2F2] border-[#FECACA] hover:border-[#EF4444]",
  },
};

/** 候補者カード見出し用: 「001 DAO VAN HOANG」形式 (英語名がなければカナ名) */
function formatCandidateLabel(person: { id: number; name: string; englishName?: string | null }): string {
  const prefix = String(person.id).padStart(3, "0");
  const label = person.englishName?.trim() || person.name;
  return `${prefix} ${label}`;
}

export default function CandidateKanban({
  candidates,
  onMove,
}: {
  candidates: CandidateCard[];
  onMove: (candidateId: number, stage: string) => void;
}) {
  const [draggingCandidateId, setDraggingCandidateId] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-9 gap-2">
    {CANDIDATE_STAGES.map((column) => {
      const columnCandidates = candidates.filter((candidate) => candidate.stage === column);
      const colors = COLUMN_COLOR[column] ?? COLUMN_COLOR["接続済み"];
      return (
        <section
          key={column}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingCandidateId) {
              onMove(draggingCandidateId, column);
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
  );
}
