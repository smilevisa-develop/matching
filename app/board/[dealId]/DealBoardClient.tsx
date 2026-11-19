"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BOARD_REC_STATUS_EN } from "@/lib/board-labels";

type Condition = { group: string; ja: string; en: string; value: string };

type DealView = {
  id: number;
  title: string;
  field: string;
  area: string;
  summary: string;
  fee: string;
  openings: number;
  deadline: string;
  publishedAt: string;
  updatedAt: string;
  jobChangeScope: string;
  placeChangeScope: string;
  renewalLimit: string;
  requirements: string[];
  conditions: Condition[];
  myCount: number;
  myLimit: number;
  totalCount: number;
  totalLimit: number;
  closed: boolean;
  full: boolean;
};

type Rec = { id: number; candidateName: string; status: string; statusNote: string; createdAt: string };
type Question = { id: number; question: string; answer: string; answeredAt: string; mine: boolean; isPublic: boolean };

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

export default function DealBoardClient({
  deal,
  myRecs,
  questions,
  preview = false,
}: {
  deal: DealView;
  myRecs: Rec[];
  questions: Question[];
  preview?: boolean;
}) {
  const router = useRouter();
  const myFull = deal.myCount >= deal.myLimit;
  const canRecommend = !preview && !deal.closed && !deal.full && !myFull;
  const blockedReason = preview
    ? "社員のプレビューです。推薦と質問はパートナーの画面からだけできます。"
    : deal.closed
    ? "この案件は締め切りました / This job is closed."
    : deal.full
      ? "推薦枠が埋まりました / All recommendation slots are filled."
      : myFull
        ? `貴社の推薦枠 (${deal.myLimit} 名) を使い切りました / You have used all ${deal.myLimit} slots.`
        : "";

  const groups = useMemo(() => {
    const map = new Map<string, Condition[]>();
    for (const c of deal.conditions) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [deal.conditions]);

  const [showForm, setShowForm] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/board" className="text-sm text-[var(--color-primary)] underline">
        ← 案件一覧 / All jobs
      </Link>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {deal.closed ? (
                <Badge muted>締切 / Closed</Badge>
              ) : deal.full ? (
                <Badge muted>満枠 / Full</Badge>
              ) : (
                <Badge>募集中 / Open</Badge>
              )}
              {deal.field ? <span className="rounded-full bg-[var(--color-light)] px-2 py-0.5 text-xs">{deal.field}</span> : null}
            </div>
            <h1 className="mt-2 text-xl font-bold text-[var(--color-text-dark)]">{deal.title}</h1>
            <p className="mt-1 text-xs text-gray-500">
              案件番号 {deal.id}
              {deal.publishedAt ? ` ・ 掲載 ${deal.publishedAt}` : ""} ・ 最終更新 {deal.updatedAt}
            </p>
            {deal.summary ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{deal.summary}</p> : null}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--color-text-dark)]">条件 / Conditions</h2>
            <dl className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
              <Row ja="勤務地の地域" en="Area" value={deal.area} />
              <Row ja="募集人数" en="Openings" value={deal.openings ? `${deal.openings} 名` : ""} />
              <Row ja="業務の変更の範囲" en="Scope of job changes" value={deal.jobChangeScope} />
              <Row ja="就業場所の変更の範囲" en="Scope of workplace changes" value={deal.placeChangeScope} />
              <Row ja="契約更新の上限" en="Renewal limit" value={deal.renewalLimit} />
            </dl>
            {groups.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">詳しい条件は準備中です。質問からお問い合わせください。 / Details are being prepared.</p>
            ) : (
              groups.map(([group, rows]) => (
                <div key={group} className="mt-5">
                  <h3 className="text-xs font-semibold text-gray-500">{group}</h3>
                  <dl className="mt-2 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                    {rows.map((c) => (
                      <Row key={c.ja} ja={c.ja} en={c.en} value={c.value} />
                    ))}
                  </dl>
                </div>
              ))
            )}
            <p className="mt-5 text-xs text-gray-500">
              会社名と所在地は、推薦をお受けしたあとにお伝えします。 / The employer&apos;s name and address are shared after we accept
              your recommendation.
            </p>
          </section>

          {deal.requirements.length ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[var(--color-text-dark)]">推薦の必須条件 / Must-have requirements</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {deal.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <QaSection dealId={deal.id} questions={questions} disabled={preview} onPosted={() => router.refresh()} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {deal.fee ? (
              <div>
                <p className="text-xs text-gray-500">紹介料 (貴社の取り分) / Your fee</p>
                <p className="text-lg font-bold text-[var(--color-primary)]">{deal.fee}</p>
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-500">貴社の推薦</dt>
              <dd>
                {deal.myCount} / {deal.myLimit} 名
              </dd>
              <dt className="text-gray-500">全体の推薦</dt>
              <dd>
                {deal.totalCount} / {deal.totalLimit} 名
              </dd>
              {deal.deadline ? (
                <>
                  <dt className="text-gray-500">締切</dt>
                  <dd>{deal.deadline}</dd>
                </>
              ) : null}
            </dl>
            {canRecommend ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-4 w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                候補者を推薦する / Recommend
              </button>
            ) : (
              <p className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">{blockedReason}</p>
            )}
          </section>

          {myRecs.length ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[var(--color-text-dark)]">貴社の推薦 / Your candidates</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {myRecs.map((r) => (
                  <li key={r.id} className="rounded-lg bg-[var(--color-light)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.candidateName}</span>
                      <span className="text-xs">
                        {r.status} / {BOARD_REC_STATUS_EN[r.status] ?? r.status}
                      </span>
                    </div>
                    {r.statusNote ? <p className="mt-1 text-xs text-gray-600">{r.statusNote}</p> : null}
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{r.createdAt}</span>
                      {r.status === "受付" ? <WithdrawButton id={r.id} onDone={() => router.refresh()} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {showForm ? (
        <RecommendForm
          dealId={deal.id}
          requirements={deal.requirements}
          onClose={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function Row({ ja, en, value }: { ja: string; en: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-gray-500">
        {ja}
        <span className="block text-[11px] text-gray-400">{en}</span>
      </dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </>
  );
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${muted ? "bg-gray-200 text-gray-600" : "bg-[var(--color-primary)] text-white"}`}>
      {children}
    </span>
  );
}

function QaSection({
  dealId,
  questions,
  disabled,
  onPosted,
}: {
  dealId: number;
  questions: Question[];
  disabled?: boolean;
  onPosted: () => void;
}) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const shown = questions.filter(
    (x) => !search.trim() || `${x.question} ${x.answer}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/board/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, question: q }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "送信できませんでした");
      setQ("");
      setSent(true);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信できませんでした");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-text-dark)]">質問と回答 / Q&amp;A</h2>
      <p className="mt-1 text-xs text-gray-500">
        回答は、この案件を見る全パートナーに公開します。質問する前に、同じ質問がないか確かめてください。 / Answers are shared with all
        partners. Please check existing answers first.
      </p>
      {questions.length > 3 ? (
        <input
          className={`${INPUT} mt-3`}
          placeholder="Q&A を探す / Search Q&A"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}
      {shown.length ? (
        <ul className="mt-3 space-y-3">
          {shown.map((x) => (
            <li key={x.id} className="rounded-lg border border-gray-100 p-3 text-sm">
              <p className="font-medium">Q. {x.question}</p>
              {x.answer ? (
                <p className="mt-1 whitespace-pre-wrap text-gray-700">
                  A. {x.answer}
                  <span className="ml-2 text-xs text-gray-400">{x.answeredAt}</span>
                  {x.mine && !x.isPublic ? <span className="ml-2 text-xs text-gray-400">(貴社だけに回答 / private)</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">回答を準備中です / Waiting for an answer</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">まだ質問はありません / No questions yet.</p>
      )}
      {disabled ? null : (
      <form onSubmit={submit} className="mt-4 space-y-2">
        <textarea
          className={INPUT}
          rows={3}
          maxLength={1000}
          placeholder="条件について質問する (日本語・英語) / Ask about this job (Japanese or English)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSent(false);
          }}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {sent ? <p className="text-sm text-[var(--color-primary)]">送信しました。回答はこのページに出ます。 / Sent. The answer will appear here.</p> : null}
        <button
          type="submit"
          disabled={sending || !q.trim()}
          className="rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-50"
        >
          {sending ? "送信中…" : "質問を送る / Send question"}
        </button>
      </form>
      )}
    </section>
  );
}

function WithdrawButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="text-xs text-gray-500 underline"
      onClick={async () => {
        if (!window.confirm("この推薦を取り下げますか？ / Withdraw this recommendation?")) return;
        setBusy(true);
        await fetch(`/api/board/recommendations/${id}`, { method: "DELETE" }).catch(() => undefined);
        setBusy(false);
        onDone();
      }}
    >
      取り下げ / Withdraw
    </button>
  );
}

function RecommendForm({
  dealId,
  requirements,
  onClose,
  onDone,
}: {
  dealId: number;
  requirements: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    candidateName: "",
    nationality: "",
    age: "",
    gender: "",
    residence: "",
    residenceStatus: "",
    japaneseLevel: "",
    experience: "",
    resumeUrl: "",
    note: "",
  });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((c) => ({ ...c, [k]: v }));
  const allChecked = requirements.every((r) => checks[r]);
  const ready = form.candidateName.trim() && allChecked && consent;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/board/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, ...form, checks, consent }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "送信できませんでした");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信できませんでした");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="my-8 w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-text-dark)]">候補者を推薦する / Recommend a candidate</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">
            閉じる / Close
          </button>
        </div>

        {requirements.length ? (
          <fieldset className="rounded-lg bg-[var(--color-light)] p-3">
            <legend className="px-1 text-xs font-semibold text-gray-600">
              必須条件をすべて満たしていますか？ / Does the candidate meet every requirement?
            </legend>
            <div className="mt-1 space-y-1.5">
              {requirements.map((r) => (
                <label key={r} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!checks[r]}
                    onChange={(e) => setChecks((c) => ({ ...c, [r]: e.target.checked }))}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="氏名 * / Name">
            <input className={INPUT} value={form.candidateName} onChange={(e) => set("candidateName", e.target.value)} required />
          </Field>
          <Field label="国籍 / Nationality">
            <input className={INPUT} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <Field label="年齢 / Age">
            <input className={INPUT} inputMode="numeric" value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="性別 / Gender">
            <select className={INPUT} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              <option value="男性">男性 / Male</option>
              <option value="女性">女性 / Female</option>
            </select>
          </Field>
          <Field label="いまいる場所 / Location">
            <select className={INPUT} value={form.residence} onChange={(e) => set("residence", e.target.value)}>
              <option value="">—</option>
              <option value="国内">日本国内 / In Japan</option>
              <option value="国外">海外 / Overseas</option>
            </select>
          </Field>
          <Field label="在留資格 / Visa status">
            <input
              className={INPUT}
              placeholder="例: 特定技能1号 / SSW (i)"
              value={form.residenceStatus}
              onChange={(e) => set("residenceStatus", e.target.value)}
            />
          </Field>
          <Field label="日本語 / Japanese">
            <input className={INPUT} placeholder="例: N3" value={form.japaneseLevel} onChange={(e) => set("japaneseLevel", e.target.value)} />
          </Field>
          <Field label="経験 / Experience">
            <input className={INPUT} value={form.experience} onChange={(e) => set("experience", e.target.value)} />
          </Field>
        </div>
        <Field label="履歴書のリンク / Resume link">
          <input className={INPUT} type="url" placeholder="https://" value={form.resumeUrl} onChange={(e) => set("resumeUrl", e.target.value)} />
        </Field>
        <Field label="推薦の理由・補足 / Notes">
          <textarea className={INPUT} rows={3} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            候補者本人から、この情報をスマイルリンクと求人企業に提供することの同意を得ています。 / The candidate has agreed to share this
            information with SMILELINK and the employer.
          </span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!allChecked ? (
          <p className="text-xs text-gray-500">必須条件にすべてチェックすると送れます。 / Check every requirement to continue.</p>
        ) : null}
        <button
          type="submit"
          disabled={!ready || sending}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "送信中…" : "推薦を送る / Send recommendation"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
