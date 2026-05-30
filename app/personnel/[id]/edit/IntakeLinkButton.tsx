"use client";

import { useState } from "react";
import IntakeFormBuilderModal from "./IntakeFormBuilderModal";

type Answers = {
  motivation: string;
  selfIntroduction: string;
  japanPurpose: string;
  currentJob: string;
  retirementReason: string;
  interviewAnswers: Record<string, string>;
};

export default function IntakeLinkButton({
  personId,
  personName,
  answers,
}: {
  personId: number;
  personName: string;
  answers: Answers;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="入力フォーム作成 / URL を発行"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-secondary)] bg-white text-[var(--color-primary)] shadow-sm transition-transform hover:scale-110 hover:bg-[var(--color-light)]"
      >
        <FormIcon />
      </button>
      {open ? (
        <IntakeFormBuilderModal
          personId={personId}
          personName={personName}
          answers={answers}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function FormIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* クリップボード型 + チェックリスト */}
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
      <circle cx="7" cy="8" r="0.6" fill="currentColor" />
      <circle cx="7" cy="12" r="0.6" fill="currentColor" />
      <circle cx="7" cy="16" r="0.6" fill="currentColor" />
    </svg>
  );
}
