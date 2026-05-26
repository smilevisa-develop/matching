"use client";

import { useMemo, useState } from "react";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  INTRODUCIBLE_RESIDENCE_STATUSES,
  INTRODUCIBLE_SCOPES,
  PARTNER_ROLES,
  RELATIONSHIP_STATUSES,
  parseCsv,
} from "@/lib/partner-profile";

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
const CHANNELS = [ALL, "LINE", "Messenger", "WhatsApp", "メール", "未設定"];
const LINK_STATUSES = [ALL, "未", "完了"];
const RATINGS = [ALL, "★1 以上", "★2 以上", "★3 以上", "★4 以上", "★5"];

export default function BroadcastClient({
  partners,
  templates,
  groups,
}: {
  partners: Partner[];
  templates: Template[];
  groups: Group[];
}) {
  const [mode, setMode] = useState<"filter" | "group">("filter");
  const [channel, setChannel] = useState(ALL);
  const [linkStatus, setLinkStatus] = useState(ALL);
  const [relationshipStatus, setRelationshipStatus] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [introducibleScope, setIntroducibleScope] = useState(ALL);
  const [introNationality, setIntroNationality] = useState(ALL);
  const [introField, setIntroField] = useState(ALL);
  const [introResStatus, setIntroResStatus] = useState(ALL);
  const [minRating, setMinRating] = useState(ALL);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  const minRatingNum = (() => {
    if (minRating === ALL) return null;
    const m = minRating.match(/(\d)/);
    return m ? Number(m[1]) : null;
  })();

  const filtered = useMemo(
    () =>
      partners.filter((p) => {
        if (channel !== ALL) {
          const ch = (p.channel ?? "未設定") || "未設定";
          if (ch !== channel) return false;
        }
        if (linkStatus !== ALL && p.linkStatus !== linkStatus) return false;
        if (relationshipStatus !== ALL && (p.relationshipStatus ?? "") !== relationshipStatus) return false;
        if (role !== ALL && (p.role ?? "") !== role) return false;
        if (introducibleScope !== ALL && (p.introducibleScope ?? "") !== introducibleScope) return false;
        if (introNationality !== ALL && !parseCsv(p.introducibleNationalities).includes(introNationality)) return false;
        if (introField !== ALL && !parseCsv(p.introducibleFields).includes(introField)) return false;
        if (introResStatus !== ALL && !parseCsv(p.introducibleResidenceStatuses).includes(introResStatus)) return false;
        if (minRatingNum !== null && (p.rating ?? 0) < minRatingNum) return false;
        return true;
      }),
    [
      partners,
      channel,
      linkStatus,
      relationshipStatus,
      role,
      introducibleScope,
      introNationality,
      introField,
      introResStatus,
      minRatingNum,
    ]
  );

  const targetCount =
    mode === "filter" ? filtered.length : groups.find((g) => g.id === Number(selectedGroup))?.memberCount ?? 0;

  const applyTemplate = (id: string) => {
    const t = templates.find((t) => t.id === Number(id));
    if (t) setMessage(t.content);
    setSelectedTemplate(id);
  };

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
          channel: channel === ALL ? null : channel,
          linkStatus: linkStatus === ALL ? null : linkStatus,
          relationshipStatus: relationshipStatus === ALL ? null : relationshipStatus,
          role: role === ALL ? null : role,
          introducibleScope: introducibleScope === ALL ? null : introducibleScope,
          introNationality: introNationality === ALL ? null : introNationality,
          introField: introField === ALL ? null : introField,
          introResStatus: introResStatus === ALL ? null : introResStatus,
          minRating: minRatingNum,
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
            : `送信完了: ${data.sentCount} 件成功 / ${data.failedCount} 件失敗`
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
                label="紹介の範囲"
                value={introducibleScope}
                onChange={setIntroducibleScope}
                options={[ALL, ...INTRODUCIBLE_SCOPES]}
              />
              <Select
                label="紹介可能 分野"
                value={introField}
                onChange={setIntroField}
                options={[ALL, ...INTRODUCIBLE_FIELDS]}
              />
              <Select
                label="紹介可能 在留資格"
                value={introResStatus}
                onChange={setIntroResStatus}
                options={[ALL, ...INTRODUCIBLE_RESIDENCE_STATUSES]}
              />
              <Select
                label="関係性"
                value={relationshipStatus}
                onChange={setRelationshipStatus}
                options={[ALL, ...RELATIONSHIP_STATUSES]}
              />
              <Select label="役割" value={role} onChange={setRole} options={[ALL, ...PARTNER_ROLES]} />
              <Select label="評価 (最低)" value={minRating} onChange={setMinRating} options={RATINGS} />
              <Select label="連絡手段" value={channel} onChange={setChannel} options={CHANNELS} />
              <Select label="連携状況" value={linkStatus} onChange={setLinkStatus} options={LINK_STATUSES} />
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
          <p className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">メッセージ</p>
          <Select
            label="テンプレート"
            value={selectedTemplate}
            onChange={applyTemplate}
            options={["", ...templates.map((t) => String(t.id))]}
            labels={["テンプレートを選択", ...templates.map((t) => t.name)]}
          />
          <textarea
            className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            placeholder="配信するメッセージを入力..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>

      {/* 右: プレビュー (左 2 カードと同じ高さに揃え、内側でスクロール) */}
      <div className="flex h-full flex-col bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
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
