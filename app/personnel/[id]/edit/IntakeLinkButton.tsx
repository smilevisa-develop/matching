"use client";

import { useEffect, useState } from "react";
import IntakeFormBuilderModal from "./IntakeFormBuilderModal";
import IconAction from "./IconAction";
import { PANEL_ACTION, usePanelActions } from "./PanelActions";

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

  // 準備パネルの「3. フォーム送信」からも開けるようにする
  const panelActions = usePanelActions();
  useEffect(
    () => panelActions?.register(PANEL_ACTION.intakeForm, () => setOpen(true)),
    [panelActions],
  );

  return (
    <>
      <IconAction
        label="フォーム"
        title="入力フォームを作成して URL を発行"
        onClick={() => setOpen(true)}
      >
        <PaperPlaneIcon />
      </IconAction>
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

function PaperPlaneIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 紙飛行機 (送信アイコン) */}
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
