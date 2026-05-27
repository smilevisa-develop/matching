"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PartnerOption = { id: number; name: string };
type LineEntry = { lineUserId: string; displayName: string | null; lastMessageText: string | null; lastSeenAt: string };
type MessengerEntry = { psid: string; lastMessageText: string | null; lastSeenAt: string };

export default function LinkPageClient({
  partners,
  unlinkedLine,
  unlinkedMessenger,
}: {
  partners: PartnerOption[];
  unlinkedLine: LineEntry[];
  unlinkedMessenger: MessengerEntry[];
}) {
  const router = useRouter();

  const link = async (partnerId: number, field: "lineUserId" | "messengerPsid", value: string) => {
    const res = await fetch(`/api/partners/${partnerId}/link-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(`紐づけ失敗: ${data.error ?? "unknown"}`);
      return;
    }
    alert("紐づけ完了");
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <Section
        title="LINE"
        badgeColor="bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]"
        count={unlinkedLine.length}
      >
        {unlinkedLine.map((entry) => (
          <ProfileRow
            key={entry.lineUserId}
            id={entry.lineUserId}
            displayName={entry.displayName}
            lastMessage={entry.lastMessageText}
            lastSeen={entry.lastSeenAt}
            partners={partners}
            onLink={(partnerId) => link(partnerId, "lineUserId", entry.lineUserId)}
          />
        ))}
        {unlinkedLine.length === 0 ? <Empty text="未紐づけの LINE ユーザーはいません" /> : null}
      </Section>

      <Section
        title="Messenger"
        badgeColor="bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]"
        count={unlinkedMessenger.length}
      >
        {unlinkedMessenger.map((entry) => (
          <ProfileRow
            key={entry.psid}
            id={entry.psid}
            displayName={null}
            lastMessage={entry.lastMessageText}
            lastSeen={entry.lastSeenAt}
            partners={partners}
            onLink={(partnerId) => link(partnerId, "messengerPsid", entry.psid)}
          />
        ))}
        {unlinkedMessenger.length === 0 ? <Empty text="未紐づけの Messenger ユーザーはいません" /> : null}
      </Section>

      <p className="text-xs text-gray-500">
        紐づけたいパートナーが一覧に無い場合は <Link href="/partners" className="text-[var(--color-primary)] hover:underline">パートナーリスト</Link> で先に登録してください。
      </p>
    </div>
  );
}

function Section({
  title,
  badgeColor,
  count,
  children,
}: {
  title: string;
  badgeColor: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${badgeColor}`}>{title}</span>
        <span className="text-sm text-gray-500">{count} 件</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

function ProfileRow({
  id,
  displayName,
  lastMessage,
  lastSeen,
  partners,
  onLink,
}: {
  id: string;
  displayName: string | null;
  lastMessage: string | null;
  lastSeen: string;
  partners: PartnerOption[];
  onLink: (partnerId: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        {displayName ? (
          <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{displayName}</p>
        ) : null}
        <p className="font-mono text-xs text-gray-500 truncate">{id}</p>
        <p className="mt-0.5 text-xs text-gray-400 truncate">
          最新: {lastMessage ?? "（メッセージなし）"} ·{" "}
          {new Date(lastSeen).toLocaleString("ja-JP")}
        </p>
      </div>
      <PartnerCombobox
        partners={partners}
        value={selectedId}
        onChange={setSelectedId}
      />
      <button
        type="button"
        onClick={() => {
          if (!selectedId) {
            alert("パートナーを選択してください");
            return;
          }
          onLink(selectedId);
        }}
        className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]"
      >
        紐づけ
      </button>
    </div>
  );
}

function PartnerCombobox({
  partners,
  value,
  onChange,
}: {
  partners: PartnerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => (value != null ? partners.find((p) => p.id === value) ?? null : null),
    [value, partners]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners.slice(0, 50); // 検索なしのときは先頭 50 件だけ表示
    return partners.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 100);
  }, [partners, query]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative w-56">
      <input
        type="text"
        value={open ? query : selected?.name ?? ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        placeholder="パートナーを検索..."
        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
      />
      {value != null ? (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          tabIndex={-1}
        >
          ✕
        </button>
      ) : null}
      {open ? (
        <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">該当なし</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full truncate px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                  value === p.id ? "bg-[var(--color-light)] font-semibold text-[var(--color-primary)]" : "text-gray-700"
                }`}
              >
                {p.name}
              </button>
            ))
          )}
          {!query && partners.length > 50 ? (
            <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100">
              先頭 50 件のみ表示。検索で絞り込んでください (全 {partners.length} 件)
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-400">{text}</p>;
}
