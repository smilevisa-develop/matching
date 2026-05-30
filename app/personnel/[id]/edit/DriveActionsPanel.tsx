"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DriveActionsPanel({
  personId,
  initialDriveFolderUrl,
}: {
  personId: number;
  initialDriveFolderUrl: string | null;
}) {
  const router = useRouter();
  const [driveFolderUrl] = useState<string | null>(initialDriveFolderUrl);

  const setUrlOnce = async () => {
    const input = prompt(
      "保管場所 (Google Drive) の URL を設定",
      "https://drive.google.com/drive/folders/"
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/personnel/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFolderUrl: trimmed }),
    });
    const result = await response.json();
    if (!result.ok) {
      alert(result.error || "更新に失敗しました");
      return;
    }
    router.refresh();
  };

  // 編集 (鉛筆) アイコンは削除。設定済みなら開くだけ、未設定ならクリックで設定
  if (driveFolderUrl) {
    return (
      <a
        href={driveFolderUrl}
        target="_blank"
        rel="noreferrer"
        title="保管場所を開く"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--color-primary)] transition-transform hover:scale-110 hover:bg-[var(--color-light)]"
      >
        <FolderIcon />
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void setUrlOnce()}
      title="保管場所 未設定 (クリックで設定)"
      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-400 transition-transform hover:scale-110 hover:text-[var(--color-primary)]"
    >
      <FolderIcon />
    </button>
  );
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l1.4 1.8c.2.25.5.4.82.4H18.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
    </svg>
  );
}
