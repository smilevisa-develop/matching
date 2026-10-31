"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import {
  CHAT_LANGUAGES,
  COUNTRY_LANG,
  DRAFT_LANGUAGES,
  hasWords,
  isDraftLang,
  type ChatLang,
  type DraftLang,
} from "@/lib/chat-languages";

/**
 * トーク (会話)。id は "p:<partnerId>" (パートナー) か "g:<groupId>" (パートナーではない
 * LINE グループ = 内定後のグループなど。連絡先紐づけで追加)。後者はパートナーへの一斉連絡の対象には入らない。
 */
type Conversation = {
  id: string;
  kind: "partner" | "group";
  partnerId: number | null;
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
  /** どのトークのメッセージか (Conversation.key) */
  convKey: string;
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

/** LINE の配色 (スマホのトーク画面の背景・送った吹き出し) */
const LINE_GREEN = "#06C755";
const LINE_BG = "#8CABD8";
const LINE_SENT = "#8DE055";

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
function displayName(p: Conversation) {
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

/** 一覧の絞り込み */
const FILTERS = [
  { v: "all", label: "すべて", short: "すべて" },
  { v: "partner", label: "パートナー", short: "パートナー" },
  { v: "group", label: "内定者・その他のグループ", short: "内定者など" },
  { v: "unread", label: "未読", short: "未読" },
] as const;
type Filter = (typeof FILTERS)[number]["v"];

export default function ChatClient({ conversations, initialMessages, initialLang, initialPinnedKeys, templates }: {
  conversations: Conversation[];
  initialMessages: Message[];
  initialLang: ChatLang;
  /** この担当者がピン留めしたトーク (一覧の上に固定) */
  initialPinnedKeys: string[];
  templates: Template[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [lang, setLang] = useState<ChatLang>(initialLang);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(initialPinnedKeys));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<"templates" | "shortcuts" | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  /** 開いた時点で未読だった最初のメッセージ (「ここから未読メッセージ」の位置) */
  const [unreadMarker, setUnreadMarker] = useState<{ key: string; messageId: number } | null>(null);
  /** いま訳を作っているメッセージ */
  const [translating, setTranslating] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const markingReadRef = useRef<string | null>(null);
  /** 訳を頼んだメッセージ (同じものを何度も頼まない。言語を変えたら空にする) */
  const requestedRef = useRef<Set<number>>(new Set());
  /** 一番下を見ているか (見ているときだけ新着を追いかける) */
  const stickToBottomRef = useRef(true);
  /** スマホでトーク画面を開いているか (スマホは一覧とトーク画面を切り替える。PC は両方出す) */
  const [mobileRoom, setMobileRoom] = useState(false);
  /** 入力欄の「翻訳」: 訳す前の文と、確認用の訳し戻し */
  const [draft, setDraft] = useState<{ original: string; back: string | null; target: DraftLang } | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  /** トークごとに選んだ「訳す言語」(選んでいなければ相手のメッセージの言語から決める) */
  const [targetByConv, setTargetByConv] = useState<Record<string, DraftLang>>({});

  const lastByPartner = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      const prev = map.get(m.convKey);
      if (!prev || new Date(m.sentAt) >= new Date(prev.sentAt)) map.set(m.convKey, m);
    }
    return map;
  }, [messages]);

  const unreadByPartner = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      if (m.direction !== "inbound" || m.readAt) continue;
      map.set(m.convKey, (map.get(m.convKey) ?? 0) + 1);
    }
    return map;
  }, [messages]);

  const sortedPartners = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const lastTime = (id: string) => {
      const last = lastByPartner.get(id);
      return last ? new Date(last.sentAt).getTime() : 0;
    };
    return conversations
      .filter((p) => {
        if (filter === "unread" && !unreadByPartner.get(p.id)) return false;
        if ((filter === "partner" || filter === "group") && p.kind !== filter) return false;
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
  }, [conversations, search, filter, lastByPartner, unreadByPartner, pinned]);

  const selected = conversations.find((p) => p.id === selectedId);
  const chat = useMemo(() => messages.filter((m) => m.convKey === selectedId), [messages, selectedId]);

  // PC は一番上のトークを開いておく。スマホは一覧から選ぶまで開かない (開くと既読になるため)
  useEffect(() => {
    if (selectedId && conversations.some((p) => p.id === selectedId)) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    setSelectedId(sortedPartners[0]?.id ?? null);
  }, [selectedId, conversations, sortedPartners]);

  /** スマホ: トーク一覧へ戻る (トークを閉じる。開いたままだと新着が既読になってしまう) */
  const backToList = () => {
    setMobileRoom(false);
    setSelectedId(null);
    setDraft(null);
    setPanel(null);
  };

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

  // 入力欄や翻訳の表示、キーボードで見える高さが変わっても、見ていた一番下のメッセージを隠さない
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let prevHeight = el.clientHeight;
    const observer = new ResizeObserver(() => {
      const height = el.clientHeight;
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
      else el.scrollTop += prevHeight - height;
      prevHeight = height;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedId]);

  // スマホのキーボードは画面の上に重なるだけで 100dvh は縮まない。見えている範囲に画面を合わせる
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      const zoomed = viewport.scale > 1.01;
      root.style.height = desktop.matches || zoomed ? "" : `${viewport.height}px`;
      root.style.transform = desktop.matches || zoomed ? "" : `translateY(${viewport.offsetTop}px)`;
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    desktop.addEventListener("change", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      desktop.removeEventListener("change", apply);
    };
  }, []);

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
    const unread = messages.filter((m) => m.convKey === selectedId && m.direction === "inbound" && !m.readAt);
    if (unread.length === 0 || markingReadRef.current === selectedId) return;

    setUnreadMarker((cur) => (cur?.key === selectedId ? cur : { key: selectedId, messageId: unread[0].id }));
    const markRead = async () => {
      markingReadRef.current = selectedId;
      const readAt = new Date().toISOString();
      setMessages((current) =>
        current.map((m) =>
          m.convKey === selectedId && m.direction === "inbound" && !m.readAt ? { ...m, readAt } : m,
        ),
      );
      try {
        const res = await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // パートナーのトークは partnerId、パートナーではないグループは groupId で既読にする
          body: JSON.stringify(
            selectedId.startsWith("p:") ? { partnerId: Number(selectedId.slice(2)) } : { groupId: selectedId.slice(2) },
          ),
        });
        if (!res.ok) await reload();
      } finally {
        markingReadRef.current = null;
      }
    };
    void markRead();
  }, [selectedId, messages]);

  const selectPartner = (id: string) => {
    if (id !== selectedId) {
      setUnreadMarker(null);
      setDraft(null);
    }
    setSelectedId(id);
    setPanel(null);
    setMobileRoom(true);
  };

  /** 訳す言語: 選んだもの → 相手の直近のメッセージの言語 (日本語で書く相手なら日本語) → 国 → 英語 */
  const draftTarget: DraftLang = useMemo(() => {
    if (selectedId && targetByConv[selectedId]) return targetByConv[selectedId];
    const last = [...chat].reverse().find((m) => m.direction === "inbound" && hasWords(m.content));
    const theirs = last ? last.sourceLang ?? (looksJapanese(last.content) ? "ja" : null) : null;
    if (isDraftLang(theirs)) return theirs;
    const byCountry = selected?.country ? COUNTRY_LANG[selected.country] : undefined;
    return byCountry ?? "en";
  }, [selectedId, targetByConv, chat, selected]);

  /** 入力した文を相手の言語に訳して入力欄に入れる (送信はしない) */
  const translateInput = async (target: DraftLang = draftTarget) => {
    const source = draft ? draft.original : input;
    if (!source.trim() || draftBusy) return;
    setDraftBusy(true);
    try {
      const res = await fetch("/api/chat/draft-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, target }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        alert(`翻訳できませんでした: ${data?.error ?? res.status}`);
        return;
      }
      setDraft({ original: source, back: data.back ?? null, target });
      setInput(data.translation);
    } finally {
      setDraftBusy(false);
    }
  };

  const chooseTarget = (target: DraftLang) => {
    if (selectedId) setTargetByConv((cur) => ({ ...cur, [selectedId]: target }));
    if (draft) void translateInput(target);
  };

  const togglePin = async (key: string) => {
    const next = !pinned.has(key);
    const apply = (on: boolean) =>
      setPinned((cur) => {
        const s = new Set(cur);
        if (on) s.add(key);
        else s.delete(key);
        return s;
      });
    apply(next);
    const res = await fetch("/api/chat/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, pinned: next }),
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
      // パートナーは send-partner、パートナーではないグループ (内定後など) は send-group
      const res =
        selected.kind === "partner"
          ? await fetch("/api/line/send-partner", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ partnerId: selected.partnerId, message: input }),
            })
          : await fetch("/api/line/send-group", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ groupId: selected.lineGroupId, message: input }),
            });
      const data = await res.json();
      if (data.ok) {
        stickToBottomRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            id: data.id ?? Date.now(),
            convKey: selected.id,
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
        setDraft(null);
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
  const targetLabel = DRAFT_LANGUAGES.find((l) => l.code === draftTarget)?.label ?? "";

  /** 訳す言語を選ぶ欄 (PC は入力欄の下、スマホは翻訳した文の上) */
  const targetSelect = (
    <select
      value={draftTarget}
      onChange={(e) => chooseTarget(e.target.value as DraftLang)}
      title="翻訳する言語 (送る相手の言語)"
      className="rounded-md border border-[#D5D7DC] bg-white px-1.5 py-1 text-[12px] text-[#333] outline-none"
    >
      {DRAFT_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-0 flex h-[100dvh] overflow-hidden bg-white text-[#111] md:static md:h-screen"
      style={{ fontFamily: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", sans-serif' }}
    >
      {/* 左: トーク一覧 (スマホはトーク画面を開いていないときだけ) */}
      <div className={`${mobileRoom ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-[#E5E6EA] md:flex md:w-[360px]`}>
        {/* スマホ: LINE の「トーク」の見出し */}
        <div className="flex h-[52px] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <p className="text-[22px] font-bold">トーク</p>
          <Link href="/" className="rounded-full px-2 py-1 text-[13px] text-[#555] active:bg-[#F2F3F5]">
            メニュー
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3 px-4 pb-2 md:h-[60px] md:border-b md:border-[#E5E6EA] md:px-3 md:pb-0">
          <div className="relative hidden md:block">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[15px] text-[#111] hover:bg-[#F2F3F5]"
            >
              <Icon d="M4 7h16M4 12h16M4 17h16" className="h-4 w-4 text-[#555]" />
              {FILTERS.find((f) => f.v === filter)?.short}
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-[#E5E6EA] bg-white py-1 shadow-lg">
                {FILTERS.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => {
                      setFilter(o.v);
                      setFilterOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#F2F3F5] ${filter === o.v ? "font-semibold" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A4A8B0] md:hidden">
              <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4" className="h-4 w-4" />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="検索"
              className="w-full rounded-full bg-[#F2F3F5] py-2 pl-9 pr-3 text-[16px] outline-none placeholder:text-[#A4A8B0] md:rounded-md md:border md:border-[#D5D7DC] md:bg-white md:px-3 md:text-[14px] md:focus:border-[#B8BCC4]"
            />
          </div>
        </div>
        {/* スマホ: 絞り込みは LINE のように横並びのボタン */}
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 md:hidden">
          {FILTERS.map((o) => (
            <button
              key={o.v}
              onClick={() => setFilter(o.v)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] ${
                filter === o.v ? "border-[#111] bg-[#111] text-white" : "border-[#D5D7DC] text-[#333]"
              }`}
            >
              {o.short}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
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
                className={`group relative flex h-[76px] w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors active:bg-[#F2F3F5] md:h-[90px] ${
                  selectedId === p.id ? "md:bg-[#EBEDF0]" : "md:hover:bg-[#F6F7F8]"
                }`}
              >
                <Avatar name={name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#111] md:text-[15px] md:font-medium">
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
                    <p className="min-w-0 flex-1 truncate text-[13.5px] text-[#5D636C] md:text-[13px]">
                      {last ? last.translation ?? last.content : "メッセージなし"}
                    </p>
                    {unread > 0 && (
                      <>
                        {/* スマホは LINE と同じく件数の緑の丸、PC は点 */}
                        <span
                          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white md:hidden"
                          style={{ background: LINE_GREEN }}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                        <span
                          className="hidden h-2.5 w-2.5 shrink-0 rounded-full md:block"
                          style={{ background: LINE_GREEN }}
                          title={`未読 ${unread}件`}
                        />
                      </>
                    )}
                    {/* カーソルを乗せたときだけ出す、ピン留めの付け外し (PC) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePin(p.id);
                      }}
                      title={pinned.has(p.id) ? "ピン留めを外す" : "ピン留め"}
                      className={`hidden shrink-0 rounded p-1 hover:bg-black/5 md:group-hover:block ${
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
              {search || filter !== "all" ? "該当するトークがありません" : "トークがありません"}
              <br />
              <span className="text-[11px]">
                連絡先が紐づいたパートナーと、連絡先紐づけで「パートナーではない」にした LINE グループが表示されます
              </span>
            </p>
          )}
        </div>
      </div>

      {/* 右: トーク画面 (スマホは LINE の青い背景) */}
      <div
        className={`${mobileRoom ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-[var(--chat-bg)] md:flex md:bg-white`}
        style={{ "--chat-bg": LINE_BG } as React.CSSProperties}
      >
        {selected ? (
          <>
            <div className="flex h-[52px] shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)] md:h-[60px] md:gap-3 md:border-b md:border-[#E5E6EA] md:px-4 md:pt-0">
              <button
                onClick={backToList}
                className="rounded-full p-1.5 text-[#111] active:bg-black/10 md:hidden"
                title="トーク一覧へ戻る"
              >
                <Icon d="M15 5l-7 7 7 7" className="h-6 w-6" />
              </button>
              <span className="hidden md:block">
                <Avatar name={displayName(selected)} size={36} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-[#111] md:text-[18px] md:font-normal">
                  {displayName(selected)}
                  {selected.lineGroupId && selected.lineGroupMemberCount ? (
                    <span className="ml-0.5 text-[15px]">({selected.lineGroupMemberCount})</span>
                  ) : null}
                </p>
                {(selected.lineGroupName && selected.lineGroupName !== selected.name) || selected.contactName ? (
                  <p className="-mt-0.5 hidden truncate text-[11px] text-[#8A8F98] md:block">
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
                className={`flex items-center gap-1.5 rounded-full p-1.5 text-[13px] font-medium active:bg-black/10 md:rounded md:border md:px-3 md:py-1.5 md:hover:bg-[#F6F7F8] ${
                  pinned.has(selected.id) ? "text-[#111] md:border-[#111]" : "text-[#333] md:border-[#D5D7DC]"
                }`}
                title={pinned.has(selected.id) ? "ピン留めを外す" : "このトークを一覧の上に固定する"}
              >
                <Icon d={PIN_ICON} className={`h-5 w-5 md:h-4 md:w-4 ${pinned.has(selected.id) ? "" : "opacity-60 md:opacity-100"}`} />
                <span className="hidden md:inline">{pinned.has(selected.id) ? "ピン留め中" : "ピン留め"}</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full p-1.5 text-[13px] font-medium text-[#333] active:bg-black/10 md:rounded md:border md:border-[#D5D7DC] md:px-3 md:py-1.5 md:hover:bg-[#F6F7F8]"
                  title="訳を表示する言語"
                >
                  <Icon
                    d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"
                    className="h-5 w-5 md:h-4 md:w-4"
                  />
                  <span className="hidden md:inline">{langLabel}</span>
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
              className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-1 md:px-4 md:pb-6 md:pt-2"
            >
              {chat.length === 0 && <p className="mt-16 text-center text-sm text-white md:text-[#8A8F98]">メッセージはありません</p>}
              {chat.map((m, i) => {
                const prev = chat[i - 1];
                const newDay = !prev || startOfDay(new Date(prev.sentAt)) !== startOfDay(new Date(m.sentAt));
                const isUnreadStart = unreadMarker?.key === selectedId && unreadMarker.messageId === m.id;
                const outbound = m.direction === "outbound";
                const sender = m.senderName || displayName(selected);
                // LINE と同じく、同じ人が続けて送ったときは名前・アイコン・吹き出しのしっぽを最初だけ出す
                const continued = !newDay && !isUnreadStart && prev?.direction === m.direction && (outbound || (prev.senderName || displayName(selected)) === sender);
                const bubble = (
                  <Bubble
                    main={m.translation ?? m.content}
                    original={m.translation ? m.content : null}
                    pending={translating.has(m.id)}
                    outbound={outbound}
                    tail={!continued}
                  />
                );
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <div className="my-4 flex justify-center">
                        <span className="rounded-full bg-black/20 px-3 py-0.5 text-[12px] text-white md:bg-[#C9CDD3]">{formatDayLabel(m.sentAt)}</span>
                      </div>
                    )}
                    {isUnreadStart && (
                      <div className="my-3 rounded-full bg-black/20 py-0.5 text-center text-[12px] text-white md:bg-[#C9CDD3]">ここから未読メッセージ</div>
                    )}
                    {outbound ? (
                      <div className={`${continued ? "mt-1" : "mt-3"} flex items-end justify-end gap-1.5`}>
                        <span className="mb-0.5 shrink-0 text-[10px] text-[#3B4A63] md:text-[11px] md:text-[#8A8F98]">{formatTime(m.sentAt)}</span>
                        {bubble}
                      </div>
                    ) : (
                      <div className={`${continued ? "mt-1" : "mt-3"} flex items-start gap-2`}>
                        {continued ? <div className="w-9 shrink-0" /> : <Avatar name={sender} size={36} />}
                        <div className="min-w-0">
                          {!continued && <p className="mb-1 text-[12px] text-[#3B4A63] md:text-[13px] md:text-[#5D636C]">{sender}</p>}
                          <div className="flex items-end gap-1.5">
                            {bubble}
                            <span className="mb-0.5 shrink-0 text-[10px] text-[#3B4A63] md:text-[11px] md:text-[#8A8F98]">{formatTime(m.sentAt)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>

            {/* 入力欄 */}
            <div className="relative shrink-0 bg-white md:border-t md:border-[#E5E6EA]">
              {panel && (
                <div className="absolute bottom-full left-0 right-0 max-h-64 overflow-y-auto border-t border-[#E5E6EA] bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-3 px-2 pb-1">
                    {(["templates", "shortcuts"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setPanel(k)}
                        className={`text-[12px] ${panel === k ? "font-semibold text-[#111]" : "text-[#8A8F98]"}`}
                      >
                        {k === "templates" ? "テンプレート" : "定型文"}
                      </button>
                    ))}
                  </div>
                  {panelItems.length === 0 && <p className="px-2 py-2 text-sm text-[#8A8F98]">テンプレートがありません</p>}
                  {panelItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setInput(item.text);
                        setDraft(null);
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

              {/* 翻訳したとき: 元の文と、確認用の訳し戻しを出す (目で確かめてから送る) */}
              {draft && (
                <div className="border-b border-[#E5E6EA] bg-[#F7F8FA] px-3 py-2 text-[12px] leading-[1.5] text-[#444]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#111]">{targetLabel}に翻訳しました</span>
                    <span className="md:hidden">{targetSelect}</span>
                    <button onClick={() => { setInput(draft.original); setDraft(null); }} className="ml-auto text-[#2563EB] underline">
                      元に戻す
                    </button>
                  </div>
                  {draft.back && (
                    <p className="mt-1 whitespace-pre-wrap break-words">
                      <span className="text-[#8A8F98]">確認 (訳し戻し): </span>
                      {draft.back}
                    </p>
                  )}
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[#8A8F98]">元の文: {draft.original}</p>
                </div>
              )}

              {/* スマホ: LINE の入力バー (＋ / 入力 / 翻訳 / 送信)。改行は Enter、送信はボタン */}
              <div className="flex items-end gap-1.5 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden">
                <button
                  onClick={() => setPanel((v) => (v ? null : "templates"))}
                  title="テンプレート・定型文"
                  className="mb-0.5 rounded-full p-1.5 text-[#333] active:bg-[#F2F3F5]"
                >
                  <Icon d={panel ? "M6 6l12 12M18 6 6 18" : "M12 5v14M5 12h14"} className="h-6 w-6" />
                </button>
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Aa"
                  className="max-h-32 min-h-[38px] flex-1 resize-none rounded-[19px] bg-[#F2F3F5] px-4 py-2 text-[16px] leading-[22px] outline-none placeholder:text-[#A4A8B0] [field-sizing:content]"
                />
                <button
                  onClick={() => void translateInput()}
                  disabled={draftBusy || !(draft ? draft.original : input).trim()}
                  title={`${targetLabel}に翻訳`}
                  className="mb-0.5 rounded-full px-2 py-1.5 text-[13px] font-bold text-[#333] active:bg-[#F2F3F5] disabled:opacity-30"
                >
                  {draftBusy ? "…" : "翻訳"}
                </button>
                <button
                  onClick={() => void send()}
                  disabled={sending || !input.trim()}
                  title="送信"
                  className="mb-0.5 rounded-full p-1.5 disabled:opacity-30"
                  style={{ color: LINE_GREEN }}
                >
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                    <path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z" />
                  </svg>
                </button>
              </div>

              {/* PC: 今までの入力欄 (Enter で送信) */}
              <div className="hidden md:block">
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
                  <div className="ml-auto flex items-center gap-1.5">
                    {targetSelect}
                    <button
                      onClick={() => void translateInput()}
                      disabled={draftBusy || !(draft ? draft.original : input).trim()}
                      className="rounded border border-[#D5D7DC] px-3 py-1.5 text-[13px] font-medium text-[#333] hover:bg-[#F6F7F8] disabled:opacity-40"
                    >
                      {draftBusy ? "翻訳中" : "翻訳"}
                    </button>
                    <button
                      onClick={() => void send()}
                      disabled={sending || !input.trim()}
                      className="rounded px-5 py-1.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
                      style={{ background: LINE_GREEN }}
                    >
                      {sending ? "送信中" : "送信"}
                    </button>
                  </div>
                </div>
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

/** 吹き出し。訳があれば訳を大きく、原文を下に小さく出す。tail は LINE の吹き出しのしっぽ (続けて送ったときは出さない) */
function Bubble({
  main,
  original,
  pending,
  outbound,
  tail,
}: {
  main: string;
  original: string | null;
  pending: boolean;
  outbound: boolean;
  tail: boolean;
}) {
  const color = outbound ? LINE_SENT : undefined;
  return (
    <div
      className={`relative max-w-[72vw] rounded-[18px] px-3.5 py-2 text-[15px] leading-[1.5] text-[#111] md:max-w-[min(520px,62vw)] md:text-[14.5px] ${
        outbound ? "" : "bg-white md:bg-[#EEF0F3]"
      }`}
      style={color ? { background: color } : undefined}
    >
      {tail && (
        <svg
          viewBox="0 0 10 12"
          className={`absolute top-0 h-3 w-2.5 ${outbound ? "-right-1.5" : "-left-1.5 -scale-x-100 text-white md:text-[#EEF0F3]"}`}
          style={outbound ? { color: LINE_SENT } : undefined}
          fill="currentColor"
        >
          <path d="M0 0h10C7 2 4 6 0 12z" />
        </svg>
      )}
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
