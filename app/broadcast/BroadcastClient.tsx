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
  email: string | null;
  lineUserId: string | null;
  lineGroupId: string | null;
  lineGroupName: string | null;
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
type Template = { id: number; name: string; content: string; emailSubject: string | null };
type Group = {
  id: number;
  name: string;
  memberCount: number;
  /** Group 所属パートナーの ID 配列 (preview / 送信整合性のために必須) */
  memberPartnerIds: number[];
};

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
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("linked");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [message, setMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  /** 送信前の確認モーダル: 押下時の (scheduled) 値を保持 */
  const [confirmingScheduled, setConfirmingScheduled] = useState<boolean | null>(null);

  const filtered = useMemo(
    () =>
      partners.filter((p) => {
        if (relationshipStatus !== ALL && (p.relationshipStatus ?? "") !== relationshipStatus) return false;
        if (introNationality !== ALL && !parseCsv(p.introducibleNationalities).includes(introNationality)) return false;
        if (introField !== ALL && !parseCsv(p.introducibleFields).includes(introField)) return false;
        const isLinked = Boolean(p.lineGroupId || p.lineUserId || p.messengerPsid || p.whatsappId || p.email);
        if (linkFilter === "linked" && !isLinked) return false;
        if (linkFilter === "unlinked" && isLinked) return false;
        return true;
      }),
    [partners, relationshipStatus, introNationality, introField, linkFilter]
  );

  /**
   * 実際の送信対象パートナー一覧。
   * filter / group どちらのモードでも、ここで返した配列がそのまま
   * プレビューにも送信 API にも渡る = 不整合ゼロ
   */
  const targetPartners = useMemo<Partner[]>(() => {
    if (mode === "filter") return filtered;
    // group mode: 選択された group のメンバー partner ID をもとに、partners から再構築
    const selectedG = groups.find((g) => g.id === Number(selectedGroup));
    if (!selectedG) return [];
    const ids = new Set(selectedG.memberPartnerIds);
    return partners.filter((p) => ids.has(p.id));
  }, [mode, filtered, groups, selectedGroup, partners]);

  const targetCount = targetPartners.length;

  const applyTemplate = (id: string) => {
    const t = templates.find((t) => t.id === Number(id));
    if (t) {
      setMessage(t.content);
      if (t.emailSubject) setEmailSubject(t.emailSubject);
    }
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
      targetPartners.length > 0
        ? {
            name: targetPartners[0].name,
            contactName: targetPartners[0].contactName,
            country: targetPartners[0].country,
            introducibleFields: targetPartners[0].introducibleFields,
          }
        : PREVIEW_PARTNER;
    return expandTemplate(message, { partner: samplePartner, openDeals, urgentDeals });
  }, [message, targetPartners, openDeals, urgentDeals]);

  const previewPartnerName =
    targetPartners.length > 0 ? targetPartners[0].name : "サンプル";

  /** 「配信」「予約」ボタン → まず確認モーダルを開く */
  const requestSend = (scheduled: boolean) => {
    if (!message.trim()) {
      alert("メッセージを入力してください");
      return;
    }
    if (scheduled && !scheduleDate) {
      alert("日時を選択してください");
      return;
    }
    if (targetPartners.length === 0) {
      alert("送信対象がいません");
      return;
    }
    setConfirmingScheduled(scheduled);
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
    if (targetPartners.length === 0) {
      alert("送信対象がいません");
      return;
    }
    // 明示的なホワイトリスト: プレビューに表示されている partner のみ送信対象
    const partnerIds = targetPartners.map((p) => p.id);
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
          partnerIds,
          message,
          emailSubject: emailSubject.trim() || null,
          scheduledAt: scheduled ? scheduleDate : null,
          templateId: selectedTemplate ? Number(selectedTemplate) : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(
          scheduled
            ? `予約完了: ${data.scheduledAt} に ${data.targetCount} 件へ送信予定`
            : `送信完了: ${data.sentCount} 件成功 (LINEグループ ${data.sentLineGroup ?? 0} / LINE個人 ${data.sentLine ?? 0} / WhatsApp ${data.sentWhatsapp ?? 0} / Messenger ${data.sentMessenger ?? 0} / メール ${data.sentEmail ?? 0}) / ${data.failedCount} 件失敗`
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
              <Select
                label="連絡先紐づけ"
                value={linkFilter}
                onChange={(v) => setLinkFilter(v as "all" | "linked" | "unlinked")}
                options={["all", "linked", "unlinked"]}
                labels={["すべて", "紐づけ済み", "未紐づけ"]}
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
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              メール件名{" "}
              <span className="text-[10px] text-gray-400">
                (メール経由のパートナーのみに適用。空欄なら「【SMILE MATCHING】ご連絡」)
              </span>
            </label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="例: 【SMILE MATCHING】今週の急ぎ案件のご案内"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            />
          </div>
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
          {targetPartners.map((p) => (
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
                {p.lineGroupId ? "LINE-Group" : p.lineUserId ? "LINE" : p.messengerPsid ? "MSG" : p.whatsappId ? "WA" : p.email ? "Mail" : "未登録"}
              </span>
            </div>
          ))}
          {targetPartners.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              {mode === "group" && !selectedGroup
                ? "グループを選択してください"
                : "対象パートナーがいません"}
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
              onClick={() => requestSend(false)}
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
                onClick={() => requestSend(true)}
                disabled={sending}
                className="w-full bg-[var(--color-primary)] text-white py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                予約確定
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 送信前 確認モーダル: 対象パートナーの最終確認 */}
      {confirmingScheduled !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-[var(--color-text-dark)]">
                配信前の最終確認
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                以下 <span className="font-semibold text-[var(--color-text-dark)]">{targetPartners.length} 社</span>{" "}
                のパートナーへ送信します。これ以外のパートナーには送信されません。
              </p>
              {/* メール経路のパートナーが含まれていれば件名を表示 */}
              {targetPartners.some(
                (p) => !p.lineGroupId && !p.lineUserId && !p.whatsappId && !p.messengerPsid && p.email
              ) ? (
                <p className="mt-2 text-[11px] text-gray-500">
                  📧 メール件名: <span className="font-medium text-[var(--color-text-dark)]">{emailSubject.trim() || "【SMILE MATCHING】ご連絡"}</span>
                </p>
              ) : null}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              <ul className="divide-y divide-gray-100">
                {targetPartners.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <span className="font-mono text-[11px] text-gray-400 shrink-0">#{p.id}</span>
                    <span className="text-sm text-[var(--color-text-dark)] truncate flex-1">{p.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {p.lineGroupId
                        ? "LINEグループ"
                        : p.lineUserId
                          ? "LINE個人"
                          : p.whatsappId
                            ? "WhatsApp"
                            : p.messengerPsid
                              ? "Messenger"
                              : p.email
                                ? "メール"
                                : "未登録"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmingScheduled(null)}
                disabled={sending}
                className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  const scheduled = confirmingScheduled ?? false;
                  setConfirmingScheduled(null);
                  await handleSend(scheduled);
                }}
                disabled={sending}
                className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {sending
                  ? "送信中..."
                  : confirmingScheduled
                    ? `${targetPartners.length} 社へ予約確定`
                    : `${targetPartners.length} 社へ配信実行`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
