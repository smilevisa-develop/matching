"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * テスト用候補者 (ID:280「テストさん」) 専用の操作パネル。
 * 本番でフォーム送信テストを繰り返すために、
 *   - すべての情報を消す (追加したての空状態に戻す)
 *   - サンプル情報を入れる
 * を行う。ID:280 の詳細ページでのみ表示される (page.tsx 側で分岐)。
 */
export default function TestResetPanel({ personId }: { personId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"clear" | "fill" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (action: "clear" | "fill") => {
    const confirmMsg =
      action === "clear"
        ? "この候補者のプロフィール情報（顔写真・基本情報・詳細情報・日本語チェック）をすべて消して、追加したての空状態に戻します。よろしいですか？"
        : "この候補者にサンプル情報を投入します（既存の入力は上書きされます）。よろしいですか？";
    if (!window.confirm(confirmMsg)) return;

    setBusy(action);
    setNote(null);
    try {
      const res = await fetch(`/api/personnel/${personId}/test-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setNote(`失敗しました: ${data.error ?? res.statusText}`);
      } else {
        setNote(action === "clear" ? "空状態に戻しました" : "サンプル情報を投入しました");
        router.refresh();
      }
    } catch (e) {
      setNote(`失敗しました: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-800">🧪 テスト用（ID:280 専用）</p>
          <p className="mt-0.5 text-[12px] text-amber-700">
            フォーム送信テスト用。状態を空/入力済みに切り替えられます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void run("clear")}
            disabled={busy !== null}
            className="rounded-full border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === "clear" ? "処理中..." : "すべての情報を消す"}
          </button>
          <button
            type="button"
            onClick={() => void run("fill")}
            disabled={busy !== null}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy === "fill" ? "処理中..." : "サンプル情報を入れる"}
          </button>
        </div>
      </div>
      {note ? <p className="mt-2 text-[12px] font-medium text-amber-800">{note}</p> : null}
    </section>
  );
}
