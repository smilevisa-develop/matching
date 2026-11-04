"use client";

import { useState } from "react";

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

/**
 * TikTok との接続 (管理者だけに出す)。
 * 1 回目: TikTok for Developers のクライアントキーとシークレットを保存 → 「TikTok と接続」で同意画面へ (アカウントごとに 1 回)。
 * 複数アカウント (ベトナム・インドネシア) は、接続するときに TikTok 側でそのアカウントにログインしておく
 */
export default function TiktokConnect({
  clientKey,
  hasSecret,
  accounts,
  result,
}: {
  clientKey: string | null;
  hasSecret: boolean;
  accounts: { openId: string; displayName: string; refreshExpiresAt: string }[];
  /** /sns?tiktok=ok|error|noapp */
  result: string | null;
}) {
  const [form, setForm] = useState({ clientKey: clientKey ?? "", clientSecret: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasSecret);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sns/tiktok/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "保存に失敗しました");
        return;
      }
      setSaved(true);
      setForm((c) => ({ ...c, clientSecret: "" }));
    } finally {
      setSaving(false);
    }
  };

  const ready = saved && form.clientKey.trim();
  return (
    <div className="space-y-3 text-sm text-[var(--color-text-dark)]">
      {result === "ok" ? <p className="rounded-lg bg-[var(--color-light)] px-3 py-2">TikTok のアカウントを接続しました</p> : null}
      {result === "error" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">TikTok との接続に失敗しました。もう一度試してください</p> : null}
      {result === "noapp" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">先にクライアントキーとシークレットを保存してください</p> : null}
      <p>
        {accounts.length === 0
          ? "まだ接続していません"
          : `接続済み: ${accounts.map((a) => `${a.displayName}（${new Date(a.refreshExpiresAt).toLocaleDateString("ja-JP")} まで）`).join("、")}`}
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">TikTok クライアントキー</span>
          <input className={INPUT} value={form.clientKey} onChange={(e) => setForm((c) => ({ ...c, clientKey: e.target.value }))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">クライアントシークレット{saved ? "（保存済み。変えるときだけ）" : ""}</span>
          <input
            className={INPUT}
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm((c) => ({ ...c, clientSecret: e.target.value }))}
            placeholder="TikTok for Developers → アプリ → Credentials"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!form.clientKey.trim() && !form.clientSecret.trim())}
            className="rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)] disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
      <a
        href={ready ? "/api/sns/tiktok/connect" : undefined}
        aria-disabled={!ready}
        className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white ${
          ready ? "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]" : "pointer-events-none bg-gray-300"
        }`}
      >
        TikTok と接続（アカウントを追加）
      </a>
    </div>
  );
}
