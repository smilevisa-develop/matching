"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 候補者詳細ヘッダの ID を編集可能にする。
 * クリック → 入力 → 保存 で /api/personnel/[id]/change-id を叩く。
 * 成功したら /personnel/{newId}/edit に遷移。
 */
export default function EditableIdBadge({
  personId,
  size = "sm",
}: {
  personId: number;
  size?: "sm" | "md";
}) {
  const textClass = size === "md" ? "text-sm font-semibold" : "text-[11px]";
  const inputWidth = size === "md" ? "w-24" : "w-20";
  const inputText = size === "md" ? "text-sm" : "text-[12px]";
  const btnText = size === "md" ? "text-xs" : "text-[11px]";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(personId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setValue(String(personId));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const submit = async () => {
    const newId = Number(value);
    if (!Number.isFinite(newId) || newId <= 0 || !Number.isInteger(newId)) {
      setError("正の整数を入力してください");
      return;
    }
    if (newId === personId) {
      cancel();
      return;
    }
    if (
      !confirm(
        `候補者 ID を ${personId} → ${newId} に変更します。\n` +
          `全ての関連データ (書類・案件紐づけ・請求 等) の personId も自動追従します。\n` +
          `続行しますか?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/personnel/${personId}/change-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? res.statusText);
        return;
      }
      // 新 ID のページに移動
      router.push(`/personnel/${newId}/edit`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 ${textClass} text-gray-500`}>
        ID #
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          className={`${inputWidth} rounded border border-gray-300 px-1 py-0.5 ${inputText} focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/50`}
          autoFocus
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className={`rounded bg-[var(--color-primary)] px-2 py-0.5 ${btnText} font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50`}
        >
          {saving ? "..." : "保存"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className={`rounded border border-gray-300 px-2 py-0.5 ${btnText} text-gray-500 hover:bg-gray-50 disabled:opacity-50`}
        >
          キャンセル
        </button>
        {error ? <span className={`ml-1 ${btnText} text-red-500`}>⚠ {error}</span> : null}
      </span>
    );
  }

  if (size === "md") {
    // 名前隣に置く用の大きい版 (バッジ)
    return (
      <button
        type="button"
        onClick={start}
        title="クリックで ID を編集"
        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
      >
        ID #{personId}
        <span className="text-[10px] opacity-60">✎</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="クリックで ID を編集"
      className="inline-flex items-center gap-1 rounded px-1 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      ID #{personId}
      <span className="text-[9px] opacity-50">✎</span>
    </button>
  );
}
