"use client";

import { useMemo, useRef, useState } from "react";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  RELATIONSHIP_STATUSES,
  parseCsv,
} from "@/lib/partner-profile";
import {
  BROADCAST_VARIABLES,
  URGENT_DEAL_STATUSES,
  expandTemplate,
  PREVIEW_PARTNER,
  type DealForBroadcast,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";

type DealJson = Omit<DealForBroadcast, "deadline"> & { deadline: string | null };

type Partner = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  linkStatus: string;
  contactName: string | null;
  lineUserId: string | null;
  messengerPsid: string | null;
  whatsappId: string | null;
  relationshipStatus: string | null;
  role: string | null;
  rating: number | null;
  introducibleNationalities: string | null;
  introducibleScope: string | null;
  introducibleFields: string | null;
  introducibleResidenceStatuses: string | null;
};
type Template = { id: number; name: string; content: string };
type Group = { id: number; name: string; memberCount: number };

const ALL = "すべて";

export default function BroadcastClient({
  partners,
  templates,
  groups,
  openDeals: openDealsRaw,
}: {
  partners: Partner[];
  templates: Template[];
  groups: Group[];
  openDeals: DealJson[];
}) {
  const openDeals: DealForBroadcast[] = useMemo(
    () =>
      openDealsRaw.map((d) => ({
        ...d,
        deadline: d.deadline ? new Date(d.deadline) : null,
      })),
    [openDealsRaw]
  );
  const urgentDeals = useMemo(
    () => openDeals.filter((d) => (URGENT_DEAL_STATUSES as readonly string[]).includes(d.status)),
    [openDeals]
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<"filter" | "group">("filter");
  const [relationshipStatus, setRelationshipStatus] = useState(ALL);
  const [introNationality, setIntroNationality] = useState(ALL);
  const [introField, setIntroField] = useState(ALL);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  const filtered = useMemo(
    () =>
      partners.filter((p) => {
        if (relationshipStatus !== ALL && (p.relationshipStatus ?? "") !== relationshipStatus) return false;
        if (introNationality !== ALL && !parseCsv(p.introducibleNationalities).includes(introNationality)) return false;
        if (introField !== ALL && !parseCsv(p.introducibleFields).includes(introField)) return false;
        return true;
      }),
    [partners, relationshipStatus, introNationality, introField]
  );

  const targetCount =
    mode === "filter" ? filtered.length : groups.find((g) => g.id === Number(selectedGroup))?.memberCount ?? 0;

  const applyTemplate = (id: string) => {
    const t = templates.find((t) => t.id === Number(id));
    if (t) setMessage(t.content);
    setSelectedTemplate(id);
  };

  /** カーソル位置に変数を挿入 */
  const insertVariable = (variable: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((m) => m + variable);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + variable + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** プレビュー: 1 件目のパートナーで変数展開 (なければダミー) */
  const previewMessage = useMemo(() => {
    if (!message.trim()) return "";
    const samplePartner: PartnerForBroadcast =
      mode === "filter" && filtered.length > 0
        ? {
            name: filtered[0].name,
            contactName: filtered[0].contactName,
            country: filtered[0].country,
            introducibleFields: filtered[0].introducibleFields,
          }
        : PREVIEW_PARTNER;
    return expandTemplate(message, { partner: samplePartner, openDeals, urgentDeals });
  }, [message, mode, filtered, openDeals, urgentDeals]);

  const previewPartnerName =
    mode === "filter" && filtered.length > 0 ? filtered[0].name : "サンプル";

  const handleSend = async (scheduled = false) => {
    if (!message.trim()) {
      alert("メッセージを入力してください");
      return;
    }
    if (scheduled && !scheduleDate) {
      alert("日時を選択してください");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          relationshipStatus: relationshipStatus === ALL ? null : relationshipStatus,
          introNationality: introNationality === ALL ? null : introNationality,
          introField: introField === ALL ? null : introField,
          groupId: selectedGroup ? Number(selectedGroup) : null,
          message,
          scheduledAt: scheduled ? scheduleDate : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(
          scheduled
            ? `予約完了: ${data.scheduledAt} に ${data.targetCount} 件へ送信予定`
            : `送信完了: ${data.sentCount} 件成功 (LINE ${data.sentLine ?? 0} / Messenger ${data.sentMessenger ?? 0}) / ${data.failedCount} 件失敗`
        );
        setShowSchedule(false);
      } else {
        alert(`送信失敗: ${data.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 items-stretch gap-6">
      {/* 左: 設定 */}
      <div className="flex flex-col gap-5">
        {/* 送信モード */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">送信対象 (パートナー)</p>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("filter")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === "filter"
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              フィルタ
            </button>
            <button
              onClick={() => setMode("group")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === "group"
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              グループ
            </button>
          </div>

          {mode === "filter" ? (
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="紹介可能 国籍"
                value={introNationality}
                onChange={setIntroNationality}
                options={[ALL, ...INTRODUCIBLE_NATIONALITIES]}
              />
              <Select
                label="紹介可能 分野"
                value={introField}
                onChange={setIntroField}
                options={[ALL, ...INTRODUCIBLE_FIELDS]}
              />
              <Select
                label="関係性"
                value={relationshipStatus}
                onChange={setRelationshipStatus}
                options={[ALL, ...RELATIONSHIP_STATUSES]}
              />
            </div>
          ) : (
            <Select
              label="グループを選択"
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={["", ...groups.map((g) => String(g.id))]}
              labels={["選択してください", ...groups.map((g) => `${g.name} (${g.memberCount}社)`)]}
            />
          )}
        </div>

        {/* メッセージ */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">メッセージ</p>
            <p className="text-[10px] text-gray-400">
              急ぎ案件 {urgentDeals.length} 件 / 募集中 {openDeals.length} 件
            </p>
          </div>
          <Select
            label="テンプレート"
            value={selectedTemplate}
            onChange={applyTemplate}
            options={["", ...templates.map((t) => String(t.id))]}
            labels={["テンプレートを選択", ...templates.map((t) => t.name)]}
          />
          <textarea
            ref={textareaRef}
            className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            placeholder={"{{パートナー名}} 様\n\n現在の急ぎ案件です:\n{{急ぎ案件一覧}}"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {/* 変数挿入チップ */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BROADCAST_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.label)}
                title={v.description}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  v.category === "案件"
                    ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2]"
                    : "border-gray-300 bg-white text-gray-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }`}
              >
                + {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* 展開プレビュー */}
        {message.trim() ? (
          <div className="bg-[#FAF9F5] rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">展開プレビュー</p>
              <p className="text-[11px] text-gray-500">
                {previewPartnerName} 宛のサンプル
              </p>
            </div>
            <pre className="whitespace-pre-wrap text-[13px] text-[var(--color-text-dark)] font-sans">
              {previewMessage}
            </pre>
          </div>
        ) : null}
      </div>

      {/* 右: プレビュー
          - 外側 wrapper を relative + min-h-0 にして「自分の中身では行高さに影響しない」状態に
          - 中の card は absolute inset-0 で wrapper のサイズちょうど = 左カラムと同じ高さに固定
          - リスト本体は flex-1 min-h-0 overflow-y-auto でカード内スクロール
       */}
      <div className="relative min-h-0">
        <div className="absolute inset-0 flex flex-col bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">対象プレビュー ({targetCount} 社)</p>
        <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
          {(mode === "filter" ? filtered : []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                {p.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{p.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {parseCsv(p.introducibleNationalities).join(", ") || "—"} · {p.relationshipStatus ?? "未設定"}
                  {p.role ? ` · ${p.role}` : ""}
                  {p.rating ? ` · ★${p.rating}` : ""}
                </p>
              </div>
              <span className="ml-auto text-xs text-gray-400 shrink-0">
                {p.lineUserId ? "LINE" : p.messengerPsid ? "MSG" : p.whatsappId ? "WA" : "未登録"}
              </span>
            </div>
          ))}
          {mode === "filter" && filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">対象パートナーがいません</p>
          )}
          {mode === "group" && (
            <p className="text-sm text-gray-400 text-center py-6">
              {selectedGroup ? `${targetCount} 社が対象` : "グループを選択してください"}
            </p>
          )}
        </div>
        </div>
      </div>
      </div>

      {/* グリッド下: ボタン + 予約フォーム (左カラム幅に合わせる) */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="flex gap-3">
            <button
              onClick={() => handleSend(false)}
              disabled={sending}
              className="flex-1 bg-[var(--color-primary)] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {sending ? "送信中..." : `この内容で配信 (${targetCount}社)`}
            </button>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="border border-[var(--color-primary)] text-[var(--color-primary)] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-light)]"
            >
              予約
            </button>
          </div>

          {showSchedule && (
            <div className="bg-[var(--color-light)] border border-[var(--color-primary)]/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">送信予約</p>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="w-full bg-[var(--color-primary)] text-white py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                予約確定
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
      >
        {options.map((o, i) => (
          <option key={o} value={o}>
            {labels?.[i] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}
