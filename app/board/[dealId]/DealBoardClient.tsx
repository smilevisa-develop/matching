"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BOARD_CONDITION_GROUPS,
  BOARD_CONDITION_LABELS,
  bt,
  recStatusLabel,
  type BoardLang,
} from "@/lib/board-i18n";

/** 条件。value は日本語の原文、text は選んだ言語 (訳が無ければ原文) */
type Condition = { key: string; group: string; value: string; text: string };
type Requirement = { ja: string; text: string };
type Original = {
  title: string;
  field: string;
  area: string;
  summary: string;
  fee: string;
  jobChangeScope: string;
  placeChangeScope: string;
  renewalLimit: string;
};

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
  requirements: Requirement[];
  conditions: Condition[];
  original: Original;
  myCount: number;
  myLimit: number;
  totalCount: number;
  totalLimit: number;
  closed: boolean;
  full: boolean;
};

type Rec = { id: number; candidateName: string; status: string; statusNote: string; createdAt: string };
type Question = {
  id: number;
  question: string;
  answer: string;
  originalQuestion: string;
  originalAnswer: string;
  translated: boolean;
  answeredAt: string;
  mine: boolean;
  isPublic: boolean;
};

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

export default function DealBoardClient({
  lang,
  translating,
  deal,
  myRecs,
  questions,
  preview = false,
}: {
  lang: BoardLang;
  translating: boolean;
  deal: DealView;
  myRecs: Rec[];
  questions: Question[];
  preview?: boolean;
}) {
  const router = useRouter();
  // 訳の画面で「日本語の原文を見る」を押したら、案件の中身を原文で出す
  const [showOriginal, setShowOriginal] = useState(false);
  const o = showOriginal ? deal.original : deal;
  const myFull = deal.myCount >= deal.myLimit;
  const canRecommend = !preview && !deal.closed && !deal.full && !myFull;
  const blockedReason = preview
    ? bt(lang, "blockedPreview")
    : deal.closed
      ? bt(lang, "blockedClosed")
      : deal.full
        ? bt(lang, "blockedFull")
        : myFull
          ? bt(lang, "blockedMine", { n: deal.myLimit })
          : "";

  const groups = useMemo(() => {
    const map = new Map<string, Condition[]>();
    for (const c of deal.conditions) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [deal.conditions]);

  const [showForm, setShowForm] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/board" className="text-sm text-[var(--color-primary)] underline">
          {bt(lang, "back")}
        </Link>
        {lang !== "ja" ? (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-lg border border-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]"
          >
            {bt(lang, showOriginal ? "showTranslation" : "showOriginal")}
          </button>
        ) : null}
      </div>
      {lang !== "ja" ? (
        <p className="mt-2 text-xs text-gray-600">
          {bt(lang, "translatedNote")}
          {translating ? ` ${bt(lang, "translating")}` : ""}
        </p>
      ) : null}

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {deal.closed ? (
                <Badge muted>{bt(lang, "badgeClosed")}</Badge>
              ) : deal.full ? (
                <Badge muted>{bt(lang, "badgeFull")}</Badge>
              ) : (
                <Badge>{bt(lang, "badgeOpen")}</Badge>
              )}
              {o.field ? <span className="rounded-full bg-[var(--color-light)] px-2 py-0.5 text-xs">{o.field}</span> : null}
            </div>
            <h1 className="mt-2 text-xl font-bold text-[var(--color-text-dark)]">{o.title}</h1>
            <p className="mt-1 text-xs text-gray-500">
              {bt(lang, "jobNo", { id: deal.id })}
              {deal.publishedAt ? ` ・ ${bt(lang, "posted")} ${deal.publishedAt}` : ""} ・ {bt(lang, "lastUpdated")} {deal.updatedAt}
            </p>
            {o.summary ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{o.summary}</p> : null}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[var(--color-text-dark)]">{bt(lang, "conditions")}</h2>
            <dl className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
              <Row label={bt(lang, "areaRegion")} value={o.area} />
              <Row label={bt(lang, "openings")} value={deal.openings ? bt(lang, "openingsValue", { n: deal.openings }) : ""} />
              <Row label={bt(lang, "jobChange")} value={o.jobChangeScope} />
              <Row label={bt(lang, "placeChange")} value={o.placeChangeScope} />
              <Row label={bt(lang, "renewal")} value={o.renewalLimit} />
            </dl>
            {groups.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">{bt(lang, "detailsPreparing")}</p>
            ) : (
              groups.map(([group, rows]) => (
                <div key={group} className="mt-5">
                  <h3 className="text-xs font-semibold text-gray-500">{BOARD_CONDITION_GROUPS[group]?.[lang] ?? group}</h3>
                  <dl className="mt-2 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                    {rows.map((c) => (
                      <Row
                        key={c.key}
                        label={BOARD_CONDITION_LABELS[c.key]?.[lang] ?? c.key}
                        value={showOriginal ? c.value : c.text}
                      />
                    ))}
                  </dl>
                </div>
              ))
            )}
            <p className="mt-5 text-xs text-gray-500">{bt(lang, "employerHidden")}</p>
          </section>

          {deal.requirements.length ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[var(--color-text-dark)]">{bt(lang, "requirements")}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {deal.requirements.map((r) => (
                  <li key={r.ja}>{showOriginal ? r.ja : r.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <QaSection
            lang={lang}
            showOriginal={showOriginal}
            dealId={deal.id}
            questions={questions}
            disabled={preview}
            onPosted={() => router.refresh()}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {o.fee ? (
              <div>
                <p className="text-xs text-gray-500">{bt(lang, "feeLabel")}</p>
                <p className="text-lg font-bold text-[var(--color-primary)]">{o.fee}</p>
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-500">{bt(lang, "myRecs")}</dt>
              <dd>{bt(lang, "people", { a: deal.myCount, b: deal.myLimit })}</dd>
              <dt className="text-gray-500">{bt(lang, "allRecs")}</dt>
              <dd>{bt(lang, "people", { a: deal.totalCount, b: deal.totalLimit })}</dd>
              {deal.deadline ? (
                <>
                  <dt className="text-gray-500">{bt(lang, "deadline")}</dt>
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
                {bt(lang, "recommend")}
              </button>
            ) : (
              <p className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">{blockedReason}</p>
            )}
          </section>

          {myRecs.length ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[var(--color-text-dark)]">{bt(lang, "yourCandidates")}</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {myRecs.map((r) => (
                  <li key={r.id} className="rounded-lg bg-[var(--color-light)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.candidateName}</span>
                      <span className="text-xs">{recStatusLabel(lang, r.status)}</span>
                    </div>
                    {r.statusNote ? <p className="mt-1 text-xs text-gray-600">{r.statusNote}</p> : null}
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{r.createdAt}</span>
                      {r.status === "受付" ? <WithdrawButton lang={lang} id={r.id} onDone={() => router.refresh()} /> : null}
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
          lang={lang}
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

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
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
  lang,
  showOriginal,
  dealId,
  questions,
  disabled,
  onPosted,
}: {
  lang: BoardLang;
  showOriginal: boolean;
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
    (x) =>
      !search.trim() ||
      `${x.question} ${x.answer} ${x.originalQuestion} ${x.originalAnswer}`.toLowerCase().includes(search.trim().toLowerCase()),
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
      if (!data.ok) throw new Error(data.error ?? bt(lang, "sendFailed"));
      setQ("");
      setSent(true);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : bt(lang, "sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-text-dark)]">{bt(lang, "qa")}</h2>
      <p className="mt-1 text-xs text-gray-500">{bt(lang, "qaNote")}</p>
      {questions.length > 3 ? (
        <input
          className={`${INPUT} mt-3`}
          placeholder={bt(lang, "qaSearch")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}
      {shown.length ? (
        <ul className="mt-3 space-y-3">
          {shown.map((x) => (
            <li key={x.id} className="rounded-lg border border-gray-100 p-3 text-sm">
              <p className="whitespace-pre-wrap font-medium">Q. {showOriginal ? x.originalQuestion : x.question}</p>
              {x.answer ? (
                <p className="mt-1 whitespace-pre-wrap text-gray-700">
                  A. {showOriginal ? x.originalAnswer : x.answer}
                  <span className="ml-2 text-xs text-gray-400">{x.answeredAt}</span>
                  {x.mine && !x.isPublic ? <span className="ml-2 text-xs text-gray-400">{bt(lang, "privateAnswer")}</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">{bt(lang, "waitingAnswer")}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">{bt(lang, "noQuestions")}</p>
      )}
      {disabled ? null : (
      <form onSubmit={submit} className="mt-4 space-y-2">
        <textarea
          className={INPUT}
          rows={3}
          maxLength={1000}
          placeholder={bt(lang, "askPlaceholder")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSent(false);
          }}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {sent ? <p className="text-sm text-[var(--color-primary)]">{bt(lang, "sentQ")}</p> : null}
        <button
          type="submit"
          disabled={sending || !q.trim()}
          className="rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-50"
        >
          {sending ? bt(lang, "sending") : bt(lang, "sendQ")}
        </button>
      </form>
      )}
    </section>
  );
}

function WithdrawButton({ lang, id, onDone }: { lang: BoardLang; id: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="text-xs text-gray-500 underline"
      onClick={async () => {
        if (!window.confirm(bt(lang, "withdrawConfirm"))) return;
        setBusy(true);
        await fetch(`/api/board/recommendations/${id}`, { method: "DELETE" }).catch(() => undefined);
        setBusy(false);
        onDone();
      }}
    >
      {bt(lang, "withdraw")}
    </button>
  );
}

function RecommendForm({
  lang,
  dealId,
  requirements,
  onClose,
  onDone,
}: {
  lang: BoardLang;
  dealId: number;
  requirements: Requirement[];
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
  // チェックは日本語の原文で送る (サーバーは原文で照らし合わせる)
  const allChecked = requirements.every((r) => checks[r.ja]);
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
      if (!data.ok) throw new Error(data.error ?? bt(lang, "sendFailed"));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : bt(lang, "sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="my-8 w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-text-dark)]">{bt(lang, "recommend")}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">
            {bt(lang, "close")}
          </button>
        </div>

        {requirements.length ? (
          <fieldset className="rounded-lg bg-[var(--color-light)] p-3">
            <legend className="px-1 text-xs font-semibold text-gray-600">{bt(lang, "reqCheck")}</legend>
            <div className="mt-1 space-y-1.5">
              {requirements.map((r) => (
                <label key={r.ja} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!checks[r.ja]}
                    onChange={(e) => setChecks((c) => ({ ...c, [r.ja]: e.target.checked }))}
                  />
                  <span>{r.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={bt(lang, "fName")}>
            <input className={INPUT} value={form.candidateName} onChange={(e) => set("candidateName", e.target.value)} required />
          </Field>
          <Field label={bt(lang, "fNationality")}>
            <input className={INPUT} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <Field label={bt(lang, "fAge")}>
            <input className={INPUT} inputMode="numeric" value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={bt(lang, "fGender")}>
            <select className={INPUT} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              <option value="男性">{bt(lang, "male")}</option>
              <option value="女性">{bt(lang, "female")}</option>
            </select>
          </Field>
          <Field label={bt(lang, "fLocation")}>
            <select className={INPUT} value={form.residence} onChange={(e) => set("residence", e.target.value)}>
              <option value="">—</option>
              <option value="国内">{bt(lang, "inJapan")}</option>
              <option value="国外">{bt(lang, "overseas")}</option>
            </select>
          </Field>
          <Field label={bt(lang, "fVisa")}>
            <input
              className={INPUT}
              placeholder={bt(lang, "fVisaPh")}
              value={form.residenceStatus}
              onChange={(e) => set("residenceStatus", e.target.value)}
            />
          </Field>
          <Field label={bt(lang, "fJapanese")}>
            <input className={INPUT} placeholder={bt(lang, "fJapanesePh")} value={form.japaneseLevel} onChange={(e) => set("japaneseLevel", e.target.value)} />
          </Field>
          <Field label={bt(lang, "fExperience")}>
            <input className={INPUT} value={form.experience} onChange={(e) => set("experience", e.target.value)} />
          </Field>
        </div>
        <Field label={bt(lang, "fResume")}>
          <input className={INPUT} type="url" placeholder="https://" value={form.resumeUrl} onChange={(e) => set("resumeUrl", e.target.value)} />
        </Field>
        <Field label={bt(lang, "fNotes")}>
          <textarea className={INPUT} rows={3} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{bt(lang, "consent")}</span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!allChecked ? (
          <p className="text-xs text-gray-500">{bt(lang, "checkAll")}</p>
        ) : null}
        <button
          type="submit"
          disabled={!ready || sending}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? bt(lang, "sending") : bt(lang, "sendRec")}
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
