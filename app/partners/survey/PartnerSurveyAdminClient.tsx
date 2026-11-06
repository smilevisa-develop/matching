"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useKeptState } from "@/app/components/KeepOnBack";
import {
  SURVEY_EMAIL_SUBJECT,
  SURVEY_EMAIL_TEXT,
  SURVEY_REQUEST_TEXT,
  type SurveyAnswers,
} from "@/lib/partner-survey";

export type SurveyChannel = {
  name: string;
  /** 送り先 (LINE グループ・メールアドレスなど) が紐づいているか */
  linked: boolean;
  /** このページからの送信で届くか (WhatsApp は紐づいていても届かない) */
  deliverable: boolean;
  /** 送り先の名前 (LINE グループ名・メールアドレス)。送る前に正しい相手か確かめる */
  to: string | null;
};

export type SurveyRow = {
  id: number;
  name: string;
  country: string | null;
  /** 一斉連絡で使う連絡手段 (未設定を除く) と、その紐づき */
  channels: SurveyChannel[];
  /** どれかの連絡手段で届く */
  reachable: boolean;
  sentAt: string | null;
  answeredAt: string | null;
  answers: SurveyAnswers;
  /** 相手がフォームに入れた会社名 (登録名と合うかの確認用)。未回答なら null */
  typedName: string | null;
  /** 入れた会社名が登録名と同じ会社とみなせるか */
  nameMatches: boolean | null;
  /** 最新の回答をパートナー情報に反映済みか (会社名が合わないと確認待ちで false) */
  applied: boolean;
  /** 反映していない回答 (新しい順)。1 件ずつ中身を見て反映できる */
  pending: { logId: number; typedName: string; answeredAt: string; nameMatches: boolean }[];
  scope: string | null;
  fields: string[];
  nationalities: string[];
};

type Filter = "all" | "unsent" | "unanswered" | "answered" | "pending" | "unreachable";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "unsent", label: "未送信" },
  { key: "unanswered", label: "送信済み・未回答" },
  { key: "answered", label: "回答済み" },
  { key: "pending", label: "要確認" },
  { key: "unreachable", label: "届かない" },
];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "";

/**
 * パートナーアンケートの管理。上で文面を確かめて送り、下で誰が答えたかを見る。
 * 送信は一斉連絡と同じ API (/api/broadcast) を「お知らせ」として使う。チャットとメールで文面を分ける
 */
export default function PartnerSurveyAdminClient({ rows, senderLastName }: { rows: SurveyRow[]; senderLastName: string }) {
  const [filter, setFilter] = useKeptState<Filter>("filter", "all");
  const [search, setSearch] = useKeptState("search", "");
  const [body, setBody] = useState(SURVEY_REQUEST_TEXT);
  const [emailSubject, setEmailSubject] = useState(SURVEY_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(SURVEY_EMAIL_TEXT);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // LINE だけに送る (2026/11 の回はメールを使わず LINE だけ)。オンのあいだは LINE の無い会社を一覧にも出さない
  const [lineOnly, setLineOnly] = useKeptState("lineOnly", true);
  const hasLine = (r: SurveyRow) => r.channels.some((c) => c.name === "LINE" && c.deliverable);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      // LINE だけのときも、回答が届いている会社は出す (要確認を見落とさないため)
      if (lineOnly && !hasLine(r) && !r.answeredAt) return false;
      if (q && !`${r.name} ${r.country ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "unsent") return !r.sentAt;
      if (filter === "unanswered") return r.sentAt && !r.answeredAt;
      if (filter === "answered") return !!r.answeredAt;
      if (filter === "pending") return !!r.answeredAt && !r.applied;
      if (filter === "unreachable") return !r.reachable;
      return true;
    });
    // 回答した人を上に (新しい順)、次に送った人、最後に未送信
    return [...list].sort(
      (a, b) =>
        (b.answeredAt ?? "").localeCompare(a.answeredAt ?? "") || (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || a.id - b.id,
    );
  }, [rows, filter, search, lineOnly]);

  const stats = {
    total: rows.length,
    reachable: rows.filter((r) => r.reachable).length,
    sent: rows.filter((r) => r.sentAt).length,
    answered: rows.filter((r) => r.answeredAt).length,
    pending: rows.filter((r) => r.answeredAt && !r.applied).length,
  };
  const [applying, setApplying] = useState<number | null>(null);
  /** 会社名が合わず止めていた回答を、中身を見たうえでパートナー情報に入れる */
  const apply = async (r: SurveyRow, item?: { logId: number; typedName: string }) => {
    if (!confirm(`「${item?.typedName ?? r.typedName ?? ""}」と入力された回答を ${r.name} の情報として反映します。よろしいですか？`)) return;
    setApplying(r.id);
    try {
      const res = await fetch(`/api/partners/${r.id}/survey-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: item?.logId ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "反映できませんでした");
        return;
      }
      window.location.reload();
    } finally {
      setApplying(null);
    }
  };
  const sendable = visible.filter((r) => (lineOnly ? hasLine(r) : r.reachable));
  const unreachable = visible.length - sendable.length;

  const sender = senderLastName || "（担当者姓）";
  /**
   * チャット用。一斉連絡の「お知らせ」の型から、冒頭の【お知らせ】・会社名・ご担当者様を外したもの
   * (登録してある会社名が正しいか分からないので、相手の会社名は出さない。2026/11)。{{アンケートURL}} は送るときにパートナーごとに入る
   */
  const message = useMemo(
    () => `お世話になっております。株式会社CROSLANの${sender}です。\n\n${body.trim()}\n\nご不明な点がございましたら、お気軽にご連絡いただけますと幸いです。`,
    [body, sender],
  );
  const emailMessage = useMemo(() => emailBody.replaceAll("{{送信者}}", sender), [emailBody, sender]);
  const sample = (text: string) =>
    text
      .replaceAll("{{パートナー名}}", sendable[0]?.name ?? "（パートナー名）")
      .replaceAll("{{担当者名}}", "ご担当者")
      .replaceAll("{{アンケートURL}}", "https://matching.smilereach.jp/partner-survey/（会社ごとのリンク）");

  const send = async () => {
    if (!body.includes("{{アンケートURL}}") || (!lineOnly && !emailMessage.includes("{{アンケートURL}}"))) {
      alert("文面に {{アンケートURL}} がありません。これが無いとパートナーが回答できません");
      return;
    }
    if (sendable.length === 0) {
      alert("送れる相手がいません");
      return;
    }
    if (!confirm(`${sendable.length} 社にアンケートの依頼を${lineOnly ? " LINE だけで" : ""}送ります。よろしいですか？`)) return;
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
          emailSubject: emailSubject.trim() || SURVEY_EMAIL_SUBJECT,
          emailMessage,
          scheduledAt: null,
          whatsappTemplateName: null,
          whatsappTemplateLang: null,
          whatsappParams: [],
          kind: "notice",
          fileIds: [],
          onlyChannels: lineOnly ? ["LINE"] : null,
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

      <div className="grid grid-cols-5 gap-3 md:max-w-2xl">
        <Stat label="アクティブ" value={stats.total} />
        <Stat label="届く" value={stats.reachable} />
        <Stat label="送信済み" value={stats.sent} />
        <Stat label="回答済み" value={stats.answered} />
        <Stat label="要確認" value={stats.pending} />
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

        <div className={`mt-4 grid gap-5 ${lineOnly ? "md:max-w-2xl" : "md:grid-cols-2"}`}>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">{lineOnly ? "LINE に送る文" : "LINE・Messenger に送る文"}</span>
              <textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">届く文面（{sendable[0]?.name ?? "サンプル"} 宛）</span>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-light)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-dark)]">
                {sample(message)}
              </pre>
            </div>
          </div>
          {lineOnly ? null : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">メールの件名</span>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-dark)]">
                メールの本文（{"{{パートナー名}} {{担当者名}} {{アンケートURL}}"} は会社ごとに入ります）
              </span>
              <textarea
                rows={22}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </label>
          </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || sendable.length === 0}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {sending ? "送信中..." : `表示中の ${sendable.length} 社に${lineOnly ? " LINE で" : ""}送る`}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-dark)]">
            <input type="checkbox" checked={lineOnly} onChange={(e) => setLineOnly(e.target.checked)} />
            LINE だけに送る（LINE の無い会社は、回答済みを除いて一覧に出さない）
          </label>
          {unreachable > 0 ? (
            <span className="text-xs text-[var(--color-text-dark)]">
              表示中の {unreachable} 社は{lineOnly ? "LINE" : "連絡手段"}が紐づいていないため送れません
            </span>
          ) : null}
        </div>
        {result ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[var(--color-light)] px-3 py-2 text-xs text-[var(--color-text-dark)]">{result}</pre>
        ) : null}
      </section>

      {/* 回答状況 */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
              <th className="px-4 py-3 w-56">パートナー</th>
              <th className="px-3 py-3 w-72">送り先（紐づいている LINE グループなど）</th>
              <th className="px-3 py-3 w-14">送信</th>
              <th className="px-3 py-3 w-14">回答</th>
              <th className="px-3 py-3 w-56">相手が入れた会社名</th>
              <th className="px-3 py-3 w-20">会社の所在地</th>
              <th className="px-3 py-3 w-28">候補者が多い</th>
              <th className="px-3 py-3">紹介できる人材</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={`border-t border-gray-100 hover:bg-gray-50 ${r.answeredAt && !r.applied ? "bg-[#FFF7E6]" : ""}`}>
                <td className="px-4 py-2">
                  <Link href={`/partners/${r.id}`} className="font-medium text-[var(--color-text-dark)] hover:underline">
                    {r.name}
                  </Link>
                  {r.country ? <span className="ml-2 text-xs text-[var(--color-text-dark)]">{r.country}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.channels.length === 0 ? (
                    <span className="text-[#dc2626]">未設定</span>
                  ) : (
                    r.channels.map((c) => (
                      <span key={c.name} className={`mr-3 inline-block break-all ${c.deliverable ? "text-[var(--color-text-dark)]" : "text-[#dc2626]"}`}>
                        {c.name} {c.deliverable ? "✓" : c.linked ? "届かない" : "✗"}
                        {c.to && c.name === "LINE" ? (
                          <Link href={`/chat?partner=${r.id}`} className="ml-1 font-semibold underline decoration-dotted hover:text-[var(--color-primary)]" title="このパートナーの LINE トークを開く">
                            {c.to}
                          </Link>
                        ) : c.to ? (
                          <span className="ml-1 font-semibold">{c.to}</span>
                        ) : null}
                      </span>
                    ))
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{fmt(r.sentAt) || <span className="text-disabled">-</span>}</td>
                <td className="px-3 py-2 text-xs font-semibold text-[var(--color-text-dark)]">
                  {fmt(r.answeredAt) || <span className="font-normal text-disabled">-</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">
                  {r.typedName ? (
                    r.applied ? (
                      <span>
                        {r.typedName} <span className="font-semibold">✓ 反映済み</span>
                      </span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        {(r.pending.length > 0
                          ? r.pending
                          : [{ logId: 0, typedName: r.typedName, answeredAt: r.answeredAt ?? "", nameMatches: !!r.nameMatches }]
                        ).map((it) => (
                          <span key={it.logId} className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#B45309]" title={it.typedName ?? ""}>
                              {(it.typedName ?? "").length > 40 ? `${(it.typedName ?? "").slice(0, 40)}…` : it.typedName}
                            </span>
                            {r.pending.length > 1 ? <span className="text-[#B45309]">{fmt(it.answeredAt)}</span> : null}
                            <span className="text-[#B45309]">{it.nameMatches ? "未反映" : "登録名と違います"}</span>
                            <button
                              type="button"
                              onClick={() => void apply(r, it.logId ? it : undefined)}
                              disabled={applying === r.id}
                              className="rounded border border-[var(--color-primary)] bg-white px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-light)] disabled:opacity-50"
                            >
                              {applying === r.id ? "反映中…" : r.pending.length > 1 ? "この回答を反映" : "この会社として反映"}
                            </button>
                          </span>
                        ))}
                      </span>
                    )
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{(r.answers.companyLocation ?? []).join("")}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-dark)]">{(r.answers.candidateLocation ?? []).join("")}</td>
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
        送り先の ✓ は紐づいていて届くもの、✗ は紐づいていないもの（連絡先紐づけで直せます）。送る前に LINE グループ名がその会社のものか確かめてください。
        回答のときに相手が入れた会社名が登録名と合えばそのまま反映します。合わないときは黄色で止めるので、中身を見て「この会社として反映」を押すか、
        別の会社の回答なら連絡先紐づけで LINE グループを正しい会社に付け替えてから、その会社にもう一度送ってください。
        WhatsApp はお知らせの承認テンプレートが無いため、このページからは届きません。
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
