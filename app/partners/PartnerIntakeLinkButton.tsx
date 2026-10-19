"use client";

import { useState } from "react";

/**
 * 新規パートナーに渡す「自己記入フォーム」のリンクをコピーする。
 * リンクは全員共通の 1 本 (CoreSettings.partnerIntakeToken)。
 */
export default function PartnerIntakeLinkButton() {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle");

  const copy = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/partner-intake-link");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "リンクを取得できませんでした");
      try {
        await navigator.clipboard.writeText(data.url);
        setState("copied");
      } catch {
        window.prompt("コピーできなかったので、ここから選択してコピーしてください", data.url);
        setState("idle");
        return;
      }
      window.setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "リンクを取得できませんでした");
      setState("error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={state === "loading"}
      title="新規パートナーに送るフォームの URL をコピーします (社名・担当者・役割・拠点国・連絡先・紹介可能・手数料を本人に記入してもらう)"
      className="shrink-0 rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)] disabled:opacity-50"
    >
      {state === "copied" ? "コピーしました ✓" : "自己記入リンクをコピー"}
    </button>
  );
}
