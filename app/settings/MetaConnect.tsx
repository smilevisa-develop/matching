"use client";

import { useState } from "react";

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

/**
 * Meta との接続 (管理者だけに出す)。
 * 1 回目: Meta アプリのアプリ ID とシークレットを入れて保存 → 「Meta と接続」で Facebook の同意画面へ。
 * 2 回目以降 (トークンが切れたとき): 「Meta と接続」を押すだけ
 */
export default function MetaConnect({
  appId,
  hasSecret,
  connected,
  expiresAt,
  result,
}: {
  appId: string | null;
  hasSecret: boolean;
  connected: boolean;
  expiresAt: string | null;
  /** /settings?meta=ok|error|noapp */
  result: string | null;
}) {
  const [form, setForm] = useState({ appId: appId ?? "", appSecret: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasSecret);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sns/meta/connect", {
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
      setForm((c) => ({ ...c, appSecret: "" }));
    } finally {
      setSaving(false);
    }
  };

  const ready = saved && form.appId.trim();
  return (
    <div className="space-y-3 text-sm text-[var(--color-text-dark)]">
      {result === "ok" ? <p className="rounded-lg bg-[var(--color-light)] px-3 py-2">Meta と接続しました</p> : null}
      {result === "error" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Meta との接続に失敗しました。もう一度試してください</p> : null}
      {result === "noapp" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">先にアプリ ID とシークレットを保存してください</p> : null}
      <p>
        {connected
          ? `接続済み${expiresAt ? `（${new Date(expiresAt).toLocaleDateString("ja-JP")} まで。切れたらもう一度「Meta と接続」）` : ""}`
          : "まだ接続していません"}
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Meta アプリ ID</span>
          <input className={INPUT} value={form.appId} onChange={(e) => setForm((c) => ({ ...c, appId: e.target.value }))} placeholder="1301485058717612" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">アプリシークレット{saved ? "（保存済み。変えるときだけ）" : ""}</span>
          <input
            className={INPUT}
            type="password"
            value={form.appSecret}
            onChange={(e) => setForm((c) => ({ ...c, appSecret: e.target.value }))}
            placeholder="Meta for Developers → アプリの設定 → ベーシック"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!form.appId.trim() && !form.appSecret.trim())}
            className="rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)] disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
      <a
        href={ready ? "/api/sns/meta/connect" : undefined}
        aria-disabled={!ready}
        className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white ${
          ready ? "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]" : "pointer-events-none bg-gray-300"
        }`}
      >
        Meta と接続
      </a>
    </div>
  );
}
