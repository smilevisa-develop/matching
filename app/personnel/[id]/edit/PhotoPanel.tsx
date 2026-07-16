"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import PersonAvatar from "@/app/components/PersonAvatar";
import EditableIdBadge from "./EditableIdBadge";

/**
 * 候補者の顔写真パネル。
 *   - アップロード: /api/personnel/[id]/documents/upload に kind="photo" で送る
 *     (Drive 候補者フォルダに保存 → サムネ URL を Person.photoUrl に自動設定)
 *   - 削除: PATCH /api/personnel/[id] で photoUrl を null に
 */
export default function PhotoPanel({
  personId,
  personName,
  initialPhotoUrl,
  iconActions,
}: {
  personId: number;
  personName: string;
  initialPhotoUrl: string | null;
  iconActions?: ReactNode;
}) {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("画像は 10MB 以下にしてください");
      return;
    }
    setUploading(true);
    try {
      // Drive 経由の正規ルート:
      //   documents/upload が Drive にアップロード → サムネ URL を Person.photoUrl に自動設定
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "photo");
      const response = await fetch(`/api/personnel/${personId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "写真のアップロードに失敗しました");
        return;
      }
      // documents/upload は Person.photoUrl をサムネ URL に更新済み。
      // ページを refresh して最新の photoUrl を取得。
      router.refresh();
      // 楽観的に自分の表示も更新 (fileUrl はサムネ URL ではないので、
      // refresh 後の person.photoUrl が正しい値になる。プレビューは仮に。)
      if (result.fileUrl) setPhotoUrl(result.fileUrl);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!photoUrl) return;
    if (!confirm("顔写真を削除しますか?")) return;
    // 削除は Person.photoUrl を null に (Drive のファイル自体は温存)
    const response = await fetch(`/api/personnel/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl: null }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      alert(result.error || "削除に失敗しました");
      return;
    }
    setPhotoUrl(null);
    router.refresh();
  };

  return (
    <section className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <PersonAvatar
        photoUrl={photoUrl}
        name={personName}
        size={80}
        className="rounded-2xl border border-gray-200 shadow-sm"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-text-dark)]">{personName}</p>
          <EditableIdBadge personId={personId} size="md" />
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]">
          {uploading ? "読み込み中..." : "写真をアップロード"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
          />
        </label>
        {photoUrl ? (
          <button
            type="button"
            onClick={() => void removePhoto()}
            className="block text-[11px] text-gray-500 hover:underline"
          >
            写真を削除
          </button>
        ) : null}
      </div>
      {iconActions ? (
        <div className="ml-auto flex shrink-0 items-center gap-3">{iconActions}</div>
      ) : null}
    </section>
  );
}
