"use client";

import { useState, useRef, useEffect } from "react";

type Partner = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  contactName: string | null;
  lineUserId: string | null;
  messengerPsid: string | null;
  whatsappId: string | null;
};
type Message = {
  id: number;
  partnerId: number | null;
  channel: string;
  direction: string;
  content: string;
  sentAt: string;
  readAt: string | null;
};
type Template = { id: number; name: string; content: string };

const CHANNEL_COLOR: Record<string, string> = {
  LINE: "bg-green-100 text-green-700",
  Messenger: "bg-blue-100 text-blue-700",
  mail: "bg-yellow-100 text-yellow-700",
  WhatsApp: "bg-emerald-100 text-emerald-700",
};

function formatDateLabel(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Avatar({ name, className }: { name: string; className: string }) {
  return (
    <div className={`${className} flex items-center justify-center bg-[var(--color-primary)] text-white font-bold`}>
      {name[0]}
    </div>
  );
}

/** パートナー向けショートカット文言 */
const SHORTCUTS: { label: string; text: string }[] = [
  { label: "案件のご案内", text: "新規の急ぎ案件をご案内します。ご紹介可能な方がいらっしゃればご連絡ください。" },
  { label: "推薦のお願い", text: "下記条件で紹介可能な人材がいらっしゃればご推薦をお願いします。" },
  { label: "状況確認", text: "先日ご案内した案件についてご進捗いかがでしょうか。" },
  { label: "面接調整", text: "候補者の面接日程の調整をお願いします。" },
  { label: "お礼", text: "ご紹介いただきありがとうございます。後ほど詳細を確認させていただきます。" },
];

export default function ChatClient({ partners, initialMessages, templates }: {
  partners: Partner[];
  initialMessages: Message[];
  templates: Template[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const markingReadRef = useRef<number | null>(null);

  const getLastMessage = (partnerId: number) =>
    messages
      .filter((message) => message.partnerId === partnerId)
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
      .at(-1);

  const getUnreadCount = (partnerId: number) =>
    messages.filter(
      (message) =>
        message.partnerId === partnerId &&
        message.direction === "inbound" &&
        !message.readAt
    ).length;

  const filteredPartners = partners.filter((partner) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;

    const lastMessage = getLastMessage(partner.id);
    return (
      partner.name.toLowerCase().includes(keyword) ||
      (partner.contactName ?? "").toLowerCase().includes(keyword) ||
      (partner.country ?? "").toLowerCase().includes(keyword) ||
      lastMessage?.content.toLowerCase().includes(keyword)
    );
  });

  const sortedPartners = [...filteredPartners].sort((a, b) => {
    const lastMessageA = getLastMessage(a.id);
    const lastMessageB = getLastMessage(b.id);
    const lastTimeA = lastMessageA ? new Date(lastMessageA.sentAt).getTime() : 0;
    const lastTimeB = lastMessageB ? new Date(lastMessageB.sentAt).getTime() : 0;

    if (lastTimeA !== lastTimeB) {
      return lastTimeB - lastTimeA;
    }

    return a.name.localeCompare(b.name, "ja");
  });

  const selected = partners.find((p) => p.id === selectedId);
  const chat = messages.filter((m) => m.partnerId === selectedId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, selectedId]);

  useEffect(() => {
    if (selectedId && sortedPartners.some((partner) => partner.id === selectedId)) {
      return;
    }
    setSelectedId(sortedPartners[0]?.id ?? null);
  }, [selectedId, sortedPartners]);

  const reload = async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      if (data.ok) setMessages(data.messages);
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reload();
    }, 8000);

    const onFocus = () => {
      void reload();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    const unreadMessages = messages.filter(
      (message) =>
        message.partnerId === selectedId &&
        message.direction === "inbound" &&
        !message.readAt
    );

    if (unreadMessages.length === 0 || markingReadRef.current === selectedId) return;

    const markRead = async () => {
      markingReadRef.current = selectedId;
      const readAt = new Date().toISOString();

      setMessages((current) =>
        current.map((message) =>
          message.partnerId === selectedId &&
          message.direction === "inbound" &&
          !message.readAt
            ? { ...message, readAt }
            : message
        )
      );

      try {
        const res = await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId: selectedId }),
        });

        if (!res.ok) {
          await reload();
        }
      } finally {
        markingReadRef.current = null;
      }
    };

    void markRead();
  }, [selectedId, messages]);

  const send = async () => {
    if (!input.trim() || !selected) return;
    if (!selected.lineUserId && !selected.messengerPsid) {
      alert("このパートナーには LINE / Messenger ID が登録されていません");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/line/send-partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: selected.id, message: input }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            partnerId: selected.id,
            channel: data.channel ?? selected.channel ?? "LINE",
            direction: "outbound",
            content: input,
            sentAt: new Date().toISOString(),
            readAt: null,
          },
        ]);
        setInput("");
      } else {
        alert(`送信失敗: ${data.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (content: string) => {
    setInput(content);
    setShowTemplates(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左: パートナー一覧 */}
      <div className="w-[360px] border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-sm text-[var(--color-text-dark)]">パートナーチャット</span>
          <button
            onClick={reload}
            disabled={reloading}
            className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
          >
            {reloading ? "読込中..." : "メッセージ読み込み"}
          </button>
        </div>
        <div className="border-b border-gray-100 px-4 py-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="パートナー名 / 国 / 担当者で検索"
            className="w-full rounded-xl border border-gray-200 bg-[var(--color-light)] px-4 py-2.5 text-sm text-[var(--color-text-dark)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedPartners.map((p) => {
            const lastMsg = getLastMessage(p.id);
            const unreadCount = getUnreadCount(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  selectedId === p.id ? "bg-[var(--color-light)] border-l-2 border-l-[var(--color-primary)]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} className="h-10 w-10 shrink-0 rounded-full text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{p.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {lastMsg && (
                          <span className="text-[11px] text-gray-400">
                            {formatDateLabel(lastMsg.sentAt)}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <span className="min-w-5 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-center text-[11px] font-semibold text-white">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                      {p.country ?? ""}{p.contactName ? ` ・ ${p.contactName}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 truncate">{lastMsg?.content ?? "メッセージなし"}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {sortedPartners.length === 0 && (
            <p className="p-4 text-sm text-gray-400 text-center">
              該当パートナーがいません<br />
              <span className="text-[11px]">LINE / Messenger ID が紐づいたパートナーのみ表示されます</span>
            </p>
          )}
        </div>
      </div>

      {/* 右: チャット画面 */}
      <div className="flex-1 flex flex-col bg-[var(--color-light)]">
        {selected ? (
          <>
            {/* ヘッダー */}
            <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
              <Avatar name={selected.name} className="h-11 w-11 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--color-text-dark)] truncate">{selected.name}</p>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {selected.country ? (
                    <span className="text-xs text-gray-500">{selected.country}</span>
                  ) : null}
                  {selected.contactName ? (
                    <span className="text-xs text-gray-500">担当: {selected.contactName}</span>
                  ) : null}
                  {selected.channel ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLOR[selected.channel] ?? "bg-gray-100 text-gray-600"}`}>
                      {selected.channel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* メッセージ一覧 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {chat.length === 0 && (
                <p className="text-center text-sm text-gray-400 mt-10">メッセージはありません</p>
              )}
              {chat.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm shadow-sm ${
                    m.direction === "outbound"
                      ? "bg-[var(--color-primary)] text-white rounded-br-sm"
                      : "bg-white text-[var(--color-text-dark)] border border-gray-200 rounded-bl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={`text-xs mt-1 ${m.direction === "outbound" ? "text-blue-200" : "text-gray-400"}`}>
                      {new Date(m.sentAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      {m.direction === "outbound" && " · 送信済み"}
                      {m.direction === "inbound" && m.readAt && " · 確認済み"}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* ショートカットボタン (パートナー向け) */}
            <div className="bg-white border-t border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="shrink-0 text-xs border border-[var(--color-primary)] text-[var(--color-primary)] px-3 py-1.5 rounded-full hover:bg-[var(--color-light)]"
              >
                テンプレート
              </button>
              {SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setInput(s.text)}
                  className="shrink-0 text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50"
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* テンプレートポップアップ */}
            {showTemplates && (
              <div className="bg-white border-t border-gray-200 px-4 py-3 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-400 mb-2">テンプレートを選択</p>
                {templates.length === 0 && (
                  <p className="text-sm text-gray-400">テンプレートがありません</p>
                )}
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.content)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--color-light)] text-sm mb-1"
                  >
                    <span className="font-medium text-[var(--color-text-dark)]">{t.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{t.content.slice(0, 30)}...</span>
                  </button>
                ))}
              </div>
            )}

            {/* 入力欄 */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                placeholder="メッセージを入力..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="bg-[var(--color-primary)] text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {sending ? "送信中" : "送信"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            左からパートナーを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
