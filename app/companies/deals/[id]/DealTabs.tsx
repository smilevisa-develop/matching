"use client";

import { useState, type ReactNode } from "react";

export default function DealTabs({
  progressContent,
  conditionContent,
  jobPostingContent,
}: {
  progressContent: ReactNode;
  conditionContent: ReactNode;
  jobPostingContent: ReactNode;
}) {
  const [tab, setTab] = useState<"progress" | "condition" | "jobPosting">("progress");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <TabButton active={tab === "progress"} onClick={() => setTab("progress")}>
          進捗
        </TabButton>
        <TabButton active={tab === "condition"} onClick={() => setTab("condition")}>
          条件
        </TabButton>
        <TabButton active={tab === "jobPosting"} onClick={() => setTab("jobPosting")}>
          求人票
        </TabButton>
      </div>

      {tab === "progress" ? progressContent : null}
      {tab === "condition" ? conditionContent : null}
      {tab === "jobPosting" ? jobPostingContent : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-[var(--color-primary)] text-white" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
