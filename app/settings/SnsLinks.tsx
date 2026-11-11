"use client";

import { useState } from "react";

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

const COUNTRIES = [
  { key: "id", label: "インドネシア" },
  { key: "vn", label: "ベトナム" },
] as const;
const PLATFORMS = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
] as const;

/**
 * 相談リンク (管理者だけに出す)。国ごとの行き先 (相談用の LINE など) を決め、
 * 媒体ごとのリンク /go/[国]-[媒体] を各 SNS のプロフィールに貼る。押された数が SNS ページに出る (lib/sns-funnel.ts)
 */
export default function SnsLinks({ base, targets }: { base: string; targets: { id: string; vn: string } }) {
  const [form, setForm] = useState(targets);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState<string | null>(null);

  const save = async () => {
    setState("saving");
    const res = await fetch("/api/sns/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setState(res.ok ? "saved" : "error");
  };
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-dark)]">
        各 SNS のプロフィールのリンクを、下の媒体ごとのリンクに貼り替えると、どの媒体から相談の入口に来たかを数えられます。押した人は、国ごとの行き先へそのまま飛びます。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {COUNTRIES.map((c) => (
          <label key={c.key} className="block text-sm font-medium text-[var(--color-text-dark)]">
            {c.label}の行き先（相談用の LINE などの URL）
            <input
              type="url"
              className={`${INPUT} mt-1`}
              value={form[c.key]}
              placeholder="https://lin.ee/..."
              onChange={(e) => {
                setForm({ ...form, [c.key]: e.target.value });
                setState("idle");
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "saving" ? "保存中…" : "保存"}
        </button>
        {state === "saved" ? <span className="text-sm text-[var(--color-text-dark)]">保存しました</span> : null}
        {state === "error" ? <span className="text-sm text-red-700">保存できませんでした</span> : null}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {COUNTRIES.flatMap((c) =>
            PLATFORMS.map((p) => {
              const url = `${base}/go/${c.key}-${p.key}`;
              return (
                <tr key={url} className="border-t border-gray-100">
                  <td className="w-40 py-2 font-medium text-[var(--color-text-dark)]">
                    {c.label} ・ {p.label}
                  </td>
                  <td className="py-2 font-mono text-[var(--color-text-dark)]">{url}</td>
                  <td className="w-20 py-2 text-right">
                    <button type="button" onClick={() => copy(url)} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
                      {copied === url ? "コピー済み" : "コピー"}
                    </button>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
