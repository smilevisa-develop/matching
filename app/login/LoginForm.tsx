"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [loginId, setLoginId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!loginId.trim() || !passcode.trim()) {
      alert("ログインIDとパスコードを入力してください");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId,
          passcode,
          nextPath,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "ログインに失敗しました");
        return;
      }

      window.location.href = result.nextPath || "/";
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">ログインID</label>
        <input
          className={INPUT}
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          placeholder="nguyet / cindy / thuy"
        />
      </div>
      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">パスコード</label>
        <input
          type="password"
          className={INPUT}
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          placeholder="6 文字以上"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--color-primary)] via-[#3E8365] to-[#C89F5B] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(46,94,78,0.35)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(46,94,78,0.45)] active:translate-y-0 disabled:opacity-60"
      >
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {saving ? "ログイン中..." : "ログイン"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </button>
    </div>
  );
}

const INPUT =
  "w-full rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm text-[var(--color-text-dark)] placeholder:text-slate-400 shadow-inner focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/35";
