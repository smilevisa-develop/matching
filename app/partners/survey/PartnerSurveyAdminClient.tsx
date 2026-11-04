"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useKeptState } from "@/app/components/KeepOnBack";
import { NOTICE_FRAME } from "@/lib/broadcast-message";
import { SURVEY_CHOICES, SURVEY_REQUEST_TEXT, type SurveyAnswers } from "@/lib/partner-survey";

export type SurveyRow = {
  id: number;
  name: string;
  country: string | null;
  /** 一斉連絡で使う連絡手段 (未設定を除く) */
  channels: string[];
  sentAt: string | null;
  answeredAt: string | null;
  answers: SurveyAnswers;
  scope: string | null;
  fields: string[];
  nationalities: string[];
};

type Filter = "all" | "unsent" | "unanswered" | "answered";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "unsent", label: "未送信" },
  { key: "unanswered", label: "送信済み・未回答" },
  { key: "answered", label: "回答済み" },
];

const EMAIL_SUBJECT = "【株式会社CROSLAN-人材事業部】ご紹介いただける人材についてのアンケート";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "";

/**
 * パートナーアンケートの管理。上で文面を確かめて送り、下で誰が答えたかを見る。
 * 送信は一斉連絡と同じ API (/api/broadcast) を「お知らせ」として使う。
 */
export default function PartnerSurveyAdminClient({ rows, senderLastName }: { rows: SurveyRow[]; senderLastName: string }) {
  const [filter, setFilter] = useKeptState<Filter>("filter", "all");
  const [search, setSearch] = useKeptState("search", "");
  const [body, setBody] = useState(SURVEY_REQUEST_TEXT);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.name} ${r.country ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "unsent") return !r.sentAt;
      if (filter === "unanswered") return r.sentAt && !r.answeredAt;
      if (filter === "answered") return !!r.answeredAt;
      return true;
    });
    // 回答した人を上に (新しい順)、次に送った人、最後に未送信
    return [...list].sort(
      (a, b) =>
        (b.answeredAt ?? "").localeCompare(a.answeredAt ?? "") || (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || a.id - b.id,
    );
  }, [rows, filter, search]);

  const stats = {
    total: rows.length,
    sent: rows.filter((r) => r.sentAt).length,
    answered: rows.filter((r) => r.answeredAt).length,
  };
  const sendable = visible.filter((r) => r.channels.length > 0);
  const noChannel = visible.length - sendable.length;
  const whatsappOnly = sendable.filter((r) => r.channels.every((c) => c === "WhatsApp")).length;

  /** 一斉連絡の「お知らせ」と同じ型。{{パートナー名}} {{担当者名}} {{アンケートURL}} は送るときにパートナーごとに入る */
  const message = useMemo(
    () =>
      NOTICE_FRAME.replace("{{1}}", "{{パートナー名}}")
        .replace("{{2}}", "{{担当者名}}")
        .replace("{{3}}", senderLastName || "（担当者姓）")
        .replace("{{4}}", body.trim()),
    [body, senderLastName],
  );
  const preview = message
    .replace("{{パートナー名}}", sendable[0]?.name ?? "（パートナー名）")
    .replace("{{担当者名}}", "ご担当者")
    .replace("{{アンケートURL}}", "https://matching.smilereach.jp/partner-survey/（会社ごとのリンク）");

  const send = async () => {
    if (!body.includes("{{アンケートURL}}")) {
      alert("本文に {{アンケートURL}} がありません。これが無いとパートナーが回答できません");
      return;
    }
    if (sendable.length === 0) {
      alert("送れる相手がいません");
      return;
    }
    if (!confirm(`${sendable.length} 社にアンケートの依頼を送ります。よろしいですか？`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "filter",
          relationshipStatus: null,
          introNationality: null,
          introField: null,
          groupId: null,
          partnerIds: sendable.map((r) => r.id),
          message,
          emailSubject: EMAIL_SUBJECT,
          scheduledAt: null,
          whatsappTemplateName: null,
          whatsappTemplateLang: null,
          whatsappParams: [],
          kind: "notice",
          fileIds: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setResult(`送信に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      const failures: { name: string; channel: string; error: string }[] = data.failures ?? [];
      setResult(
        `送信しました: ${data.sentCount} 件成功 / ${data.failedCount} 件失敗` +
          (failures.length > 0 ? `\n${failures.map((f) => `・${f.name} (${f.channel}): ${f.error}`).join("\n")}` : ""),
      );
      // 送信日を画面に出すため読み直す
      window.setTimeout(() => window.location.reload(), 2500);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">パートナーアンケート</h1>
          <p className="mt-1 text-sm text-[var(--color-text-dark)]">
            紹介できる人材・手数料・強みを各社に答えてもらい、そのままパートナー情報に反映します。
          </p>
        </div>
        <a
          href="/partner-survey/preview"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
        >
          アンケートの画面を見る
        </a>
      </div>

      <div className="grid grid-cols-3 gap-3 md:max-w-md">
        <Stat label="アクティブ" value={stats.total} />
        <Stat label="送信済み" value={stats.sent} />
        <Stat label="回答済み" value={stats.answered} />
      </div>

      {/* 送る */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === f.key
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-gray-300 bg-white text-[var(--color-text-dark)] hover:border-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前・国で絞り込み"
            className="ml-1 w-44 rounded-lg border border-gray-300 px-3 py-1 text-xs text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          <span className="text-xs text-[var(--color-text-dark)]">{visible.length} 社</span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">
              送る内容（{"{{アンケートURL}}"} が会社ごとのリンクになります）
            </span>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">届く文面（{sendable[0]?.name ?? "サンプル"} 宛）</span>
            <pre className="h-[calc(100%-1.25rem)] min-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-light)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-dark)]">
              {preview}
            </pre>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || sendable.length === 0}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {sending ? "送信中..." : `表示中の ${sendable.length} 社に送る`}
          </button>
          <span className="text-xs text-[var(--color-text-dark)]">
            {noChannel > 0 ? `連絡手段が未設定の ${noChannel} 社には送れません。` : ""}
            {whatsappOnly > 0 ? `WhatsApp だけの ${whatsappOnly} 社には届きません（詳細の「アンケートのリンクをコピー」で個別に送ってください）。` : ""}
          </span>
        </div>
        {result ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[var(--color-light)] px-3 py-2 text-xs text-[var(--color-text-dark)]">{result}</pre>
        ) : null}
      </section>

      {/* 回答状況 */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
              <th className="px-4 py-3">パートナー</th>
              <th className="px-3 py-3 w-24">連絡手段</th>
              <th className="px-3 py-3 w-16">送信</th>
              <th className="px-3 py-3 w-16">回答</th>
              <th className="px-3 py-3 w-24">今すぐの人数</th>
              <th className="px-3 py-3 w-28">日本語</th>
              <th className="px-3 py-3 w-24">提示まで</th>
              <th className="px-3 py-3">紹介できる人材</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/partners/${r.id}`} className="font-medium text-[var(--color-text-dark)] hover:underline">
                    {r.name}
                  </Link>
                  {r.country ? <span className="ml-2 text-xs text-[var(--color-text-dark)]">{r.country}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">
                  {r.channels.length > 0 ? r.channels.join("・") : <span className="text-disabled">未設定</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{fmt(r.sentAt) || <span className="text-disabled">-</span>}</td>
                <td className="px-3 py-2 text-xs font-semibold text-[var(--color-text-dark)]">
                  {fmt(r.answeredAt) || <span className="font-normal text-disabled">-</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{(r.answers.poolSize ?? []).join("")}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{(r.answers.japaneseLevels ?? []).join("・")}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{(r.answers.responseDays ?? []).join("")}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">
                  {[r.scope, ...r.nationalities.slice(0, 3), ...r.fields.slice(0, 4)].filter(Boolean).join("・")}
                  {r.fields.length > 4 ? ` 他${r.fields.length - 4}` : ""}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-text-dark)]">
                  該当するパートナーはいません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-[var(--color-text-dark)]">
        回答の選択肢: 今すぐの人数 {SURVEY_CHOICES.poolSize.options.map((o) => o.value).join(" / ")}、提示まで{" "}
        {SURVEY_CHOICES.responseDays.options.map((o) => o.value).join(" / ")}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-[var(--color-text-dark)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text-dark)]">{value}</p>
    </div>
  );
}
