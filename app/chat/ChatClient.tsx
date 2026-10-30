"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, Fragment } from "react";
import { CHAT_LANGUAGES, hasWords, type ChatLang } from "@/lib/chat-languages";

type Partner = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  contactName: string | null;
  lineUserId: string | null;
  lineGroupId: string | null;
  lineGroupName: string | null;
  lineGroupMemberCount: number | null;
  messengerPsid: string | null;
  whatsappId: string | null;
};
type Message = {
  id: number;
  partnerId: number | null;
  channel: string;
  direction: string;
  content: string;
  senderName: string | null;
  sentAt: string;
  readAt: string | null;
  /** 本文の言語 (AI 判定。未判定は null) */
  sourceLang: string | null;
  /** 担当者の表示言語への訳 (同じ言語・未作成なら null) */
  translation: string | null;
};
type Template = { id: number; name: string; content: string };

/** LINE の配色 */
const LINE_GREEN = "#06C755";

/** パートナー向けショートカット文言 */
const SHORTCUTS: { label: string; text: string }[] = [
  { label: "案件のご案内", text: "新規の急ぎ案件をご案内します。ご紹介可能な方がいらっしゃればご連絡ください。" },
  { label: "推薦のお願い", text: "下記条件で紹介可能な人材がいらっしゃればご推薦をお願いします。" },
  { label: "状況確認", text: "先日ご案内した案件についてご進捗いかがでしょうか。" },
  { label: "面接調整", text: "候補者の面接日程の調整をお願いします。" },
  { label: "お礼", text: "ご紹介いただきありがとうございます。後ほど詳細を確認させていただきます。" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 一覧の時刻: 今日は 10:41、昨日は「昨日」、それ以前は 10/26 */
function formatListTime(value: string) {
  const d = new Date(value);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days === 0) return formatTime(value);
  if (days === 1) return "昨日";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 日付の区切り: 今日 / 昨日 / 10/26(月) */
function formatDayLabel(value: string) {
  const d = new Date(value);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}/` : "";
  return `${year}${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/** かなを含めば日本語 (lib/translate-ja の looksJapanese と同じ判定) */
function looksJapanese(s: string) {
  return /[぀-ヿ]/.test(s);
}

/** 名前から決まる色 (LINE の既定アイコン風に、人ごとに色を変える) */
const AVATAR_COLORS = ["#F7C948", "#FF6B5B", "#4FC08D", "#5AA9F7", "#A77BF3", "#8D6E63", "#3CC4C0", "#F28AB2"];
function avatarColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name, size }: { name: string; size: number }) {
  // 【MM】 や [INDO] のような頭の括弧は飛ばして、名前の 1 文字目を出す
  const label = name.replace(/^[\[【(（].*?[\]】)）]\s*/, "").trim() || name;
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.4) }}
    >
      {[...label][0] ?? "?"}
    </div>
  );
}

/** 会話一覧の表示名。LINE グループはグループ名を優先 */
function displayName(p: Partner) {
  return p.lineGroupName || p.name;
}

/** 担当者の表示言語に訳す必要があるか */
function needsTranslation(m: Message, lang: ChatLang) {
  if (m.translation || !hasWords(m.content)) return false;
  const src = m.sourceLang ?? (looksJapanese(m.content) ? "ja" : null);
  return src !== lang;
}

const PIN_ICON =
  "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export default function ChatClient({ partners, initialMessages, initialLang, initialPinnedIds, templates }: {
  partners: Partner[];
  initialMessages: Message[];
  initialLang: ChatLang;
  /** この担当者がピン留めしたトーク (一覧の上に固定) */
  initialPinnedIds: number[];
  templates: Template[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [lang, setLang] = useState<ChatLang>(initialLang);
  const [pinned, setPinned] = useState<Set<number>>(() => new Set(initialPinnedIds));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"templates" | "shortcuts" | null>(null);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  /** 開いた時点で未読だった最初のメッセージ (「ここから未読メッセージ」の位置) */
  const [unreadMarker, setUnreadMarker] = useState<{ partnerId: number; messageId: number } | null>(null);
  /** いま訳を作っているメッセージ */
  const [translating, setTranslating] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const markingReadRef = useRef<number | null>(null);
  /** 訳を頼んだメッセージ (同じものを何度も頼まない。言語を変えたら空にする) */
  const requestedRef = useRef<Set<number>>(new Set());
  /** 一番下を見ているか (見ているときだけ新着を追いかける) */
  const stickToBottomRef = useRef(true);

  const lastByPartner = useMemo(() => {
    const map = new Map<number, Message>();
    for (const m of messages) {
      if (m.partnerId == null) continue;
      const prev = map.get(m.partnerId);
      if (!prev || new Date(m.sentAt) >= new Date(prev.sentAt)) map.set(m.partnerId, m);
    }
    return map;
  }, [messages]);

  const unreadByPartner = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of messages) {
      if (m.partnerId == null || m.direction !== "inbound" || m.readAt) continue;
      map.set(m.partnerId, (map.get(m.partnerId) ?? 0) + 1);
    }
    return map;
  }, [messages]);

  const sortedPartners = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const lastTime = (id: number) => {
      const last = lastByPartner.get(id);
      return last ? new Date(last.sentAt).getTime() : 0;
    };
    return partners
      .filter((p) => {
        if (unreadOnly && !unreadByPartner.get(p.id)) return false;
        if (!keyword) return true;
        const last = lastByPartner.get(p.id);
        return [p.name, p.lineGroupName, p.contactName, p.country, last?.content, last?.translation].some((v) =>
          (v ?? "").toLowerCase().includes(keyword),
        );
      })
      // ピン留めしたトークを上に。その中と残りは、新しいメッセージ順
      .sort(
        (a, b) =>
          Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
          lastTime(b.id) - lastTime(a.id) ||
          a.name.localeCompare(b.name, "ja"),
      );
  }, [partners, search, unreadOnly, lastByPartner, unreadByPartner, pinned]);

  const selected = partners.find((p) => p.id === selectedId);
  const chat = useMemo(() => messages.filter((m) => m.partnerId === selectedId), [messages, selectedId]);

  useEffect(() => {
    if (selectedId && partners.some((p) => p.id === selectedId)) return;
    setSelectedId(sortedPartners[0]?.id ?? null);
  }, [selectedId, partners, sortedPartners]);

  // 会話を開いたときは一番下へ (アニメーションなし)
  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedId]);

  // 新しいメッセージや訳が届いたら、下を見ていたときだけ追いかける
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const reload = async () => {
    const res = await fetch("/api/messages");
    const data = await res.json().catch(() => null);
    if (data?.ok) setMessages(data.messages);
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => void reload(), 8000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // 開いている会話で訳が無いもの (過去分・失敗分) を、直近 60 件まで訳してもらう
  useEffect(() => {
    const ids = chat
      .filter((m) => needsTranslation(m, lang) && !requestedRef.current.has(m.id))
      .slice(-60)
      .map((m) => m.id);
    if (ids.length === 0) return;
    ids.forEach((id) => requestedRef.current.add(id));
    setTranslating((cur) => new Set([...cur, ...ids]));
    const requestLang = lang;
    void (async () => {
      try {
        const res = await fetch("/api/chat/translations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = await res.json().catch(() => null);
        if (!data?.ok || data.lang !== requestLang) return;
        const translations = data.translations as Record<string, string>;
        const sourceLangs = data.sourceLangs as Record<string, string>;
        setMessages((cur) =>
          cur.map((m) =>
            translations[m.id] || sourceLangs[m.id]
              ? { ...m, translation: translations[m.id] ?? m.translation, sourceLang: sourceLangs[m.id] ?? m.sourceLang }
              : m,
          ),
        );
      } finally {
        setTranslating((cur) => {
          const next = new Set(cur);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    })();
  }, [chat, lang]);

  // 開いた会話を既読にする (未読の先頭は「ここから未読メッセージ」用に覚えておく)
  useEffect(() => {
    if (!selectedId) return;
    const unread = messages.filter((m) => m.partnerId === selectedId && m.direction === "inbound" && !m.readAt);
    if (unread.length === 0 || markingReadRef.current === selectedId) return;

    setUnreadMarker((cur) => (cur?.partnerId === selectedId ? cur : { partnerId: selectedId, messageId: unread[0].id }));
    const markRead = async () => {
      markingReadRef.current = selectedId;
      const readAt = new Date().toISOString();
      setMessages((current) =>
        current.map((m) =>
          m.partnerId === selectedId && m.direction === "inbound" && !m.readAt ? { ...m, readAt } : m,
        ),
      );
      try {
        const res = await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId: selectedId }),
        });
        if (!res.ok) await reload();
      } finally {
        markingReadRef.current = null;
      }
    };
    void markRead();
  }, [selectedId, messages]);

  const selectPartner = (id: number) => {
    if (id !== selectedId) setUnreadMarker(null);
    setSelectedId(id);
    setPanel(null);
  };

  const togglePin = async (partnerId: number) => {
    const next = !pinned.has(partnerId);
    const apply = (on: boolean) =>
      setPinned((cur) => {
        const s = new Set(cur);
        if (on) s.add(partnerId);
        else s.delete(partnerId);
        return s;
      });
    apply(next);
    const res = await fetch("/api/chat/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, pinned: next }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!data?.ok) {
      apply(!next);
      alert(`ピン留めを${next ? "付け" : "外せ"}ませんでした: ${data?.error ?? "通信エラー"}`);
    }
  };

  const changeLang = async (next: ChatLang) => {
    setLangOpen(false);
    if (next === lang) return;
    const res = await fetch("/api/chat/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: next }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      alert(`表示言語を変えられませんでした: ${data?.error ?? res.status}`);
      return;
    }
    requestedRef.current = new Set();
    setLang(next);
    // 前の言語の訳を消してから、新しい言語の訳を読み直す
    setMessages((cur) => cur.map((m) => ({ ...m, translation: null })));
    await reload();
  };

  const send = async () => {
    if (!input.trim() || !selected || sending) return;
    if (!selected.lineGroupId && !selected.lineUserId && !selected.messengerPsid) {
      alert("このパートナーには LINE グループ / 個人 LINE / Messenger ID が登録されていません");
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
        stickToBottomRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            id: data.id ?? Date.now(),
            partnerId: selected.id,
            channel: data.channel ?? selected.channel ?? "LINE",
            direction: "outbound",
            // サーバが {{変数}} を展開した本文を返すのでそれを表示
            content: data.content ?? input,
            senderName: null,
            sentAt: new Date().toISOString(),
            readAt: null,
            sourceLang: null,
            translation: null,
          },
        ]);
        setInput("");
        setPanel(null);
      } else {
        alert(`送信失敗: ${data.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  const langLabel = CHAT_LANGUAGES.find((l) => l.code === lang)?.label ?? "日本語";
  const panelItems =
    panel === "templates"
      ? templates.map((t) => ({ key: `t${t.id}`, label: t.name, text: t.content }))
      : SHORTCUTS.map((s) => ({ key: s.label, label: s.label, text: s.text }));

  return (
    <div
      className="flex h-screen overflow-hidden bg-white text-[#111]"
      style={{ fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", sans-serif' }}
    >
      {/* 左: トーク一覧 */}
      <div className="flex w-[360px] shrink-0 flex-col border-r border-[#E5E6EA]">
        <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#E5E6EA] px-3">
          <div className="relative">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[15px] text-[#111] hover:bg-[#F2F3F5]"
            >
              <Icon d="M4 7h16M4 12h16M4 17h16" className="h-4 w-4 text-[#555]" />
              {unreadOnly ? "未読" : "すべて"}
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-[#E5E6EA] bg-white py-1 shadow-lg">
                {[
                  { v: false, label: "すべて" },
                  { v: true, label: "未読" },
                ].map((o) => (
                  <button
                    key={o.label}
                    onClick={() => {
                      setUnreadOnly(o.v);
                      setFilterOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#F2F3F5] ${unreadOnly === o.v ? "font-semibold" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索"
            className="min-w-0 flex-1 rounded-md border border-[#D5D7DC] bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#A4A8B0] focus:border-[#B8BCC4]"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {sortedPartners.map((p) => {
            const last = lastByPartner.get(p.id);
            const unread = unreadByPartner.get(p.id) ?? 0;
            const name = displayName(p);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => selectPartner(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") selectPartner(p.id);
                }}
                className={`group relative flex h-[90px] w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors ${
                  selectedId === p.id ? "bg-[#EBEDF0]" : "hover:bg-[#F6F7F8]"
                }`}
              >
                <Avatar name={name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#111]">
                      {name}
                      {p.lineGroupId && p.lineGroupMemberCount ? (
                        <span className="ml-1 font-normal">({p.lineGroupMemberCount})</span>
                      ) : null}
                    </p>
                    {pinned.has(p.id) && (
                      <span title="ピン留め中" className="shrink-0 text-[#8A8F98]">
                        <Icon d={PIN_ICON} className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {last && <span className="shrink-0 text-[12px] text-[#8A8F98]">{formatListTime(last.sentAt)}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-[#5D636C]">
                      {last ? last.translation ?? last.content : "メッセージなし"}
                    </p>
                    {unread > 0 && (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LINE_GREEN }} title={`未読 ${unread}件`} />
                    )}
                    {/* カーソルを乗せたときだけ出す、ピン留めの付け外し */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePin(p.id);
                      }}
                      title={pinned.has(p.id) ? "ピン留めを外す" : "ピン留め"}
                      className={`hidden shrink-0 rounded p-1 group-hover:block hover:bg-black/5 ${
                        pinned.has(p.id) ? "text-[#111]" : "text-[#8A8F98]"
                      }`}
                    >
                      <Icon d={pinned.has(p.id) ? "M6 6l12 12M18 6 6 18" : PIN_ICON} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {sortedPartners.length === 0 && (
            <p className="p-6 text-center text-sm text-[#8A8F98]">
              {search || unreadOnly ? "該当するトークがありません" : "トークがありません"}
              <br />
              <span className="text-[11px]">LINE グループ / 個人 LINE / Messenger ID が紐づいたパートナーのみ表示されます</span>
            </p>
          )}
        </div>
      </div>

      {/* 右: トーク画面 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#E5E6EA] px-4">
              <Avatar name={displayName(selected)} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] text-[#111]">
                  {displayName(selected)}
                  {selected.lineGroupId && selected.lineGroupMemberCount ? (
                    <span className="ml-0.5 text-[15px]">({selected.lineGroupMemberCount})</span>
                  ) : null}
                </p>
                {(selected.lineGroupName && selected.lineGroupName !== selected.name) || selected.contactName ? (
                  <p className="-mt-0.5 truncate text-[11px] text-[#8A8F98]">
                    {[
                      selected.lineGroupName && selected.lineGroupName !== selected.name ? selected.name : null,
                      selected.contactName ? `担当: ${selected.contactName}` : null,
                    ]
                      .filter(Boolean)
                      .join(" ・ ")}
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => void togglePin(selected.id)}
                className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-[13px] font-medium hover:bg-[#F6F7F8] ${
                  pinned.has(selected.id) ? "border-[#111] text-[#111]" : "border-[#D5D7DC] text-[#333]"
                }`}
                title={pinned.has(selected.id) ? "ピン留めを外す" : "このトークを一覧の上に固定する"}
              >
                <Icon d={PIN_ICON} className="h-4 w-4" />
                {pinned.has(selected.id) ? "ピン留め中" : "ピン留め"}
              </button>
              <div className="relative">
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded border border-[#D5D7DC] px-3 py-1.5 text-[13px] font-medium text-[#333] hover:bg-[#F6F7F8]"
                  title="訳を表示する言語"
                >
                  <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" className="h-4 w-4" />
                  {langLabel}
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-[#E5E6EA] bg-white py-1 shadow-lg">
                    <p className="px-3 pb-1 pt-1.5 text-[11px] text-[#8A8F98]">訳を表示する言語</p>
                    {CHAT_LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => void changeLang(l.code)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F2F3F5]"
                      >
                        {l.label}
                        {l.code === lang && <Icon d="M5 12.5 10 17l9-10" className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 overflow-y-auto px-4 pb-6 pt-2"
            >
              {chat.length === 0 && <p className="mt-16 text-center text-sm text-[#8A8F98]">メッセージはありません</p>}
              {chat.map((m, i) => {
                const prev = chat[i - 1];
                const newDay = !prev || startOfDay(new Date(prev.sentAt)) !== startOfDay(new Date(m.sentAt));
                const isUnreadStart = unreadMarker?.partnerId === selectedId && unreadMarker.messageId === m.id;
                const outbound = m.direction === "outbound";
                const sender = m.senderName || displayName(selected);
                const bubble = (
                  <Bubble
                    main={m.translation ?? m.content}
                    original={m.translation ? m.content : null}
                    pending={translating.has(m.id)}
                    outbound={outbound}
                  />
                );
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <div className="my-4 flex justify-center">
                        <span className="rounded-full bg-[#C9CDD3] px-3 py-0.5 text-[12px] text-white">{formatDayLabel(m.sentAt)}</span>
                      </div>
                    )}
                    {isUnreadStart && (
                      <div className="my-3 rounded-full bg-[#C9CDD3] py-0.5 text-center text-[12px] text-white">ここから未読メッセージ</div>
                    )}
                    {outbound ? (
                      <div className="mt-3 flex items-end justify-end gap-1.5">
                        <span className="mb-0.5 shrink-0 text-[11px] text-[#8A8F98]">{formatTime(m.sentAt)}</span>
                        {bubble}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-start gap-2.5">
                        <Avatar name={sender} size={36} />
                        <div className="min-w-0">
                          <p className="mb-1 text-[13px] text-[#5D636C]">{sender}</p>
                          <div className="flex items-end gap-1.5">
                            {bubble}
                            <span className="mb-0.5 shrink-0 text-[11px] text-[#8A8F98]">{formatTime(m.sentAt)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>

            {/* 入力欄 */}
            <div className="relative shrink-0 border-t border-[#E5E6EA]">
              {panel && (
                <div className="absolute bottom-full left-0 right-0 max-h-64 overflow-y-auto border-t border-[#E5E6EA] bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                  <p className="px-2 pb-1 text-[11px] text-[#8A8F98]">{panel === "templates" ? "テンプレート" : "定型文"}</p>
                  {panelItems.length === 0 && <p className="px-2 py-2 text-sm text-[#8A8F98]">テンプレートがありません</p>}
                  {panelItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setInput(item.text);
                        setPanel(null);
                      }}
                      className="flex w-full items-baseline gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#F2F3F5]"
                    >
                      <span className="shrink-0 font-medium">{item.label}</span>
                      <span className="truncate text-xs text-[#8A8F98]">{item.text}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className="block h-[92px] w-full resize-none px-4 pt-3 text-[15px] outline-none placeholder:text-[#A4A8B0]"
                placeholder="Enterで送信 / Shift + Enterで改行"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <button
                  onClick={() => setPanel((v) => (v === "templates" ? null : "templates"))}
                  title="テンプレート"
                  className={`rounded-md p-1.5 hover:bg-[#F2F3F5] ${panel === "templates" ? "text-[#111]" : "text-[#6B7079]"}`}
                >
                  <Icon d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />
                </button>
                <button
                  onClick={() => setPanel((v) => (v === "shortcuts" ? null : "shortcuts"))}
                  title="定型文"
                  className={`rounded-md p-1.5 hover:bg-[#F2F3F5] ${panel === "shortcuts" ? "text-[#111]" : "text-[#6B7079]"}`}
                >
                  <Icon d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />
                </button>
                <button
                  onClick={() => void send()}
                  disabled={sending || !input.trim()}
                  className="ml-auto rounded px-5 py-1.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
                  style={{ background: LINE_GREEN }}
                >
                  {sending ? "送信中" : "送信"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[#8A8F98]">左からトークを選択してください</div>
        )}
      </div>
    </div>
  );
}

/** 吹き出し。訳があれば訳を大きく、原文を下に小さく出す */
function Bubble({ main, original, pending, outbound }: { main: string; original: string | null; pending: boolean; outbound: boolean }) {
  return (
    <div
      className={`max-w-[min(520px,62vw)] rounded-[18px] px-3.5 py-2 text-[14.5px] leading-[1.5] text-[#111] ${
        outbound ? "bg-[#8DE055]" : "bg-[#EEF0F3]"
      }`}
    >
      <p className="whitespace-pre-wrap break-words">{main}</p>
      {original && (
        <p
          className={`mt-1.5 whitespace-pre-wrap break-words border-t pt-1.5 text-[12px] leading-[1.45] ${
            outbound ? "border-black/10 text-[#2F5A1C]" : "border-black/[0.07] text-[#7A7F87]"
          }`}
        >
          {original}
        </p>
      )}
      {!original && pending && <p className="mt-1 text-[11px] text-[#8A8F98]">翻訳中…</p>}
    </div>
  );
}
