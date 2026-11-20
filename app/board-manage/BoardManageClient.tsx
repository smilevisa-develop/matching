"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BOARD_REC_STATUSES, BOARD_STATUS_LABEL } from "@/lib/board-labels";

export type ManageDeal = {
  id: number;
  title: string;
  companyName: string;
  field: string;
  status: string;
  requiredCount: number;
  deadline: string;
  hasPosting: boolean;
  boardStatus: string;
  boardTitle: string;
  boardArea: string;
  boardSummary: string;
  boardPartnerFee: string;
  boardRequirements: string;
  boardJobChangeScope: string;
  boardPlaceChangeScope: string;
  boardRenewalLimit: string;
  boardPerPartnerLimit: number;
  boardTotalLimit: number | null;
  effectiveTotalLimit: number;
  publishedAt: string;
  activeRecs: number;
  openQuestions: number;
  missing: string[];
};

export type ManageRec = {
  id: number;
  createdAt: string;
  partnerName: string;
  dealId: number;
  dealLabel: string;
  candidateName: string;
  details: string;
  resumeUrl: string;
  note: string;
  status: string;
  statusNote: string;
  /** 候補者に取り込んだあとの Person.id */
  personId: number | null;
};

export type ManageQuestion = {
  id: number;
  createdAt: string;
  partnerName: string;
  dealId: number;
  dealLabel: string;
  question: string;
  /** 質問の日本語訳 (日本語以外で書かれたときだけ) */
  questionJa: string;
  answer: string;
  isPublic: boolean;
  answeredAt: string;
};

export type ManagePartner = {
  id: number;
  name: string;
  country: string;
  role: string;
  relationship: string;
  boardEnabled: boolean;
  licenseNumber: string;
  link: string;
};

type Tab = "deals" | "recs" | "qa" | "partners";

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: "通信に失敗しました" }));
  if (!data.ok) throw new Error(data.error ?? "保存できませんでした");
  return data;
}

export default function BoardManageClient({
  initialTab,
  deals,
  recs,
  questions,
  partners,
}: {
  initialTab: Tab;
  deals: ManageDeal[];
  recs: ManageRec[];
  questions: ManageQuestion[];
  partners: ManagePartner[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const newRecs = recs.filter((r) => r.status === "受付").length;
  const openQs = questions.filter((q) => !q.answer).length;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-[var(--color-text-dark)]">案件ボード（パートナー公開）</h1>
      <p className="mt-1 text-sm text-gray-600">
        登録済みのパートナーだけが見られる案件ボードです。会社名・住所はパートナーに出ません。パートナーの画面は
        <a href="/board" target="_blank" rel="noreferrer" className="mx-1 text-[var(--color-primary)] underline">
          /board
        </a>
        （社員はプレビューとして見られます）。
      </p>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        <TabButton active={tab === "deals"} onClick={() => setTab("deals")}>
          案件 <Count n={deals.filter((d) => d.boardStatus === "open").length} label="公開中" />
        </TabButton>
        <TabButton active={tab === "recs"} onClick={() => setTab("recs")}>
          推薦 <Count n={newRecs} label="未確認" alert />
        </TabButton>
        <TabButton active={tab === "qa"} onClick={() => setTab("qa")}>
          質問 <Count n={openQs} label="未回答" alert />
        </TabButton>
        <TabButton active={tab === "partners"} onClick={() => setTab("partners")}>
          パートナー <Count n={partners.filter((p) => p.boardEnabled).length} label="登録済み" />
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "deals" ? <DealsTab deals={deals} /> : null}
        {tab === "recs" ? <RecsTab recs={recs} /> : null}
        {tab === "qa" ? <QaTab questions={questions} /> : null}
        {tab === "partners" ? <PartnersTab partners={partners} /> : null}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
        active ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n, label, alert }: { n: number; label: string; alert?: boolean }) {
  return (
    <span
      className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${alert && n > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}
      title={label}
    >
      {label} {n}
    </span>
  );
}

/* ───────────── 案件 ───────────── */

function DealsTab({ deals }: { deals: ManageDeal[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (deals.length === 0) {
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">募集中の案件がありません。</p>;
  }
  return (
    <div className="space-y-2">
      {deals.map((d) => (
        <div key={d.id} className="rounded-xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setOpenId(openId === d.id ? null : d.id)}
            className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
          >
            <BoardStatusPill status={d.boardStatus} />
            <span className="font-semibold">{d.companyName}</span>
            <span className="text-sm text-gray-600">{d.title}</span>
            {d.field ? <span className="rounded-full bg-[var(--color-light)] px-2 py-0.5 text-xs">{d.field}</span> : null}
            <span className="ml-auto text-xs text-gray-500">
              推薦 {d.activeRecs}/{d.effectiveTotalLimit}
              {d.openQuestions ? <span className="ml-2 text-red-600">未回答 {d.openQuestions}</span> : null}
            </span>
          </button>
          {openId === d.id ? <DealEditor deal={d} /> : null}
        </div>
      ))}
    </div>
  );
}

function BoardStatusPill({ status }: { status: string }) {
  const cls =
    status === "open" ? "bg-[var(--color-primary)] text-white" : status === "closed" ? "bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-500";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{BOARD_STATUS_LABEL[status] ?? status}</span>;
}

function DealEditor({ deal }: { deal: ManageDeal }) {
  const router = useRouter();
  const [f, setF] = useState({
    boardTitle: deal.boardTitle,
    boardArea: deal.boardArea,
    boardSummary: deal.boardSummary,
    boardPartnerFee: deal.boardPartnerFee,
    boardRequirements: deal.boardRequirements,
    boardJobChangeScope: deal.boardJobChangeScope,
    boardPlaceChangeScope: deal.boardPlaceChangeScope,
    boardRenewalLimit: deal.boardRenewalLimit,
    boardPerPartnerLimit: String(deal.boardPerPartnerLimit),
    boardTotalLimit: deal.boardTotalLimit ? String(deal.boardTotalLimit) : "",
    deadline: deal.deadline,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));

  const save = async (boardStatus?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await send(`/api/board-manage/deals/${deal.id}`, "PATCH", { ...f, ...(boardStatus ? { boardStatus } : {}) });
      setMsg({ ok: true, text: boardStatus === "open" ? "公開しました" : boardStatus ? "変更しました" : "保存しました" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setBusy(false);
    }
  };

  const notify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const data = await send(`/api/board-manage/deals/${deal.id}/notify`, "POST", {});
      if (window.confirm(`分野が合う登録済みパートナー ${data.count} 社の連絡グループを作りました。一斉連絡の画面で文面を確かめてから送ってください。開きますか？`)) {
        window.location.href = data.url;
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "準備できませんでした" });
    } finally {
      setBusy(false);
    }
  };

  const nameLeak = deal.companyName && `${f.boardTitle}${f.boardSummary}`.includes(deal.companyName);

  return (
    <div className="space-y-4 border-t border-gray-100 px-4 py-4">
      {!deal.hasPosting ? (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          この案件には求人票がまだありません。給与や寮などの条件は、求人票を作るとボードに出ます。
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="ボードに出す案件名（会社名は入れない）*">
          <input className={INPUT} value={f.boardTitle} onChange={(e) => set("boardTitle", e.target.value)} placeholder="例: 大阪の食品工場・特定技能1号" />
        </Field>
        <Field label="勤務地の地域（都道府県・市区まで）*">
          <input className={INPUT} value={f.boardArea} onChange={(e) => set("boardArea", e.target.value)} placeholder="例: 大阪府堺市" />
        </Field>
        <Field label="パートナーの取り分（登録済みパートナーにだけ見える）">
          <input className={INPUT} value={f.boardPartnerFee} onChange={(e) => set("boardPartnerFee", e.target.value)} placeholder="例: 1名につき 15万円" />
        </Field>
        <Field label="締切日">
          <input className={INPUT} type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} />
        </Field>
        <Field label="パートナー1社あたりの推薦の上限">
          <input className={INPUT} inputMode="numeric" value={f.boardPerPartnerLimit} onChange={(e) => set("boardPerPartnerLimit", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label={`案件全体の推薦の上限（空なら ${deal.requiredCount > 0 ? `募集人数×3 = ${deal.requiredCount * 3}` : "10"} 名）`}>
          <input className={INPUT} inputMode="numeric" value={f.boardTotalLimit} onChange={(e) => set("boardTotalLimit", e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <Field label="この案件のポイント・向いている人">
        <textarea className={INPUT} rows={3} value={f.boardSummary} onChange={(e) => set("boardSummary", e.target.value)} />
      </Field>
      <Field label="推薦の必須条件（1行に1つ。パートナーは全部にチェックしないと推薦できない）">
        <textarea
          className={INPUT}
          rows={3}
          value={f.boardRequirements}
          onChange={(e) => set("boardRequirements", e.target.value)}
          placeholder={"例:\n介護技能評価試験に合格している\n日本語 N4 以上"}
        />
      </Field>
      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-xs font-semibold text-gray-600">募集時に示す労働条件（職業安定法・2024年4月から）*</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="業務の変更の範囲">
            <input className={INPUT} value={f.boardJobChangeScope} onChange={(e) => set("boardJobChangeScope", e.target.value)} placeholder="例: 変更なし" />
          </Field>
          <Field label="就業場所の変更の範囲">
            <input className={INPUT} value={f.boardPlaceChangeScope} onChange={(e) => set("boardPlaceChangeScope", e.target.value)} placeholder="例: 変更なし" />
          </Field>
          <Field label="契約更新の上限">
            <input className={INPUT} value={f.boardRenewalLimit} onChange={(e) => set("boardRenewalLimit", e.target.value)} placeholder="例: 無期雇用 / 更新上限なし" />
          </Field>
        </div>
      </fieldset>

      {nameLeak ? <p className="text-sm text-red-600">案件名かポイントに会社名が入っています。パートナーに会社名が見えてしまいます。</p> : null}
      {deal.missing.length && deal.boardStatus !== "open" ? (
        <p className="text-xs text-gray-500">公開に必要（保存後に判定）: {deal.missing.join("、")}</p>
      ) : null}
      {msg ? <p className={`text-sm ${msg.ok ? "text-[var(--color-primary)]" : "text-red-600"}`}>{msg.text}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => save()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">
          保存
        </button>
        {deal.boardStatus !== "open" ? (
          <button
            type="button"
            disabled={busy || !!nameLeak}
            onClick={() => save("open")}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            保存して公開する
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={notify}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              title="分野が合う登録済みパートナーの連絡グループを作り、一斉連絡の画面を開きます (送るのは画面で確かめてから)"
            >
              条件が合うパートナーにお知らせ
            </button>
            <button type="button" disabled={busy} onClick={() => save("closed")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">
              締め切る
            </button>
          </>
        )}
        {deal.boardStatus !== "hidden" ? (
          <>
            <button type="button" disabled={busy} onClick={() => save("hidden")} className="rounded-lg px-4 py-2 text-sm text-gray-600 underline">
              ボードから外す
            </button>
            <a href={`/board/${deal.id}`} target="_blank" rel="noreferrer" className="px-2 py-2 text-sm text-[var(--color-primary)] underline">
              パートナーの画面で見る
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── 推薦 ───────────── */

function RecsTab({ recs }: { recs: ManageRec[] }) {
  const [filter, setFilter] = useState<"active" | "all">("active");
  const shown = filter === "all" ? recs : recs.filter((r) => !["見送り", "取り下げ", "内定"].includes(r.status));
  return (
    <div>
      <div className="mb-3 flex gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={filter === "active"} onChange={() => setFilter("active")} /> 進行中
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={filter === "all"} onChange={() => setFilter("all")} /> すべて
        </label>
        <span className="ml-auto text-gray-500">{shown.length} 件</span>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">推薦はまだありません。</p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <RecRow key={r.id} rec={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecRow({ rec }: { rec: ManageRec }) {
  const router = useRouter();
  const [status, setStatus] = useState(rec.status);
  const [note, setNote] = useState(rec.statusNote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = status !== rec.status || note !== rec.statusNote;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await send(`/api/board-manage/recommendations/${rec.id}`, "PATCH", { status, statusNote: note });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_260px]">
      <div className="text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{rec.candidateName}</span>
          <span className="text-xs text-gray-500">#{rec.id} ・ {rec.createdAt}</span>
        </div>
        <p className="mt-0.5 text-gray-600">{rec.details || "（詳細なし）"}</p>
        <p className="mt-1">
          <span className="text-gray-500">案件:</span> {rec.dealLabel} <span className="ml-2 text-gray-500">推薦元:</span> {rec.partnerName}
        </p>
        {rec.resumeUrl ? (
          <a href={rec.resumeUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[var(--color-primary)] underline">
            履歴書を開く
          </a>
        ) : null}
        {rec.note ? <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-gray-700">{rec.note}</p> : null}
        <ImportBox rec={rec} />
      </div>
      <div className="space-y-2">
        <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
          {BOARD_REC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className={INPUT}
          placeholder="パートナーへの一言（見送りの理由など）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {err ? <p className="text-xs text-red-600">{err}</p> : null}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="w-full rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          状況を更新（パートナーに見える）
        </button>
      </div>
    </div>
  );
}

/** 推薦を候補者に取り込む (同じ名前の人がいれば、紐づけるか新しく作るかを選ぶ) */
function ImportBox({ rec }: { rec: ManageRec }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dups, setDups] = useState<{ id: number; name: string; englishName: string | null; birthDate: string | null }[] | null>(null);

  if (rec.personId) {
    return (
      <p className="mt-2 text-sm">
        候補者に取り込み済み:{" "}
        <a href={`/personnel/${rec.personId}`} className="text-[var(--color-primary)] underline">
          #{rec.personId} を開く
        </a>
      </p>
    );
  }

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/board-manage/recommendations/${rec.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "通信に失敗しました" }));
      if (data.duplicates) {
        setDups(data.duplicates);
        return;
      }
      if (!data.ok) throw new Error(data.error ?? "取り込めませんでした");
      setDups(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取り込めませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      {dups ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
          <p className="font-semibold text-amber-900">同じ名前の候補者がいます。同じ人なら紐づけてください。</p>
          <ul className="mt-1 space-y-1">
            {dups.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <a href={`/personnel/${d.id}`} target="_blank" rel="noreferrer" className="underline">
                  #{d.id} {d.name}
                  {d.englishName ? ` (${d.englishName})` : ""}
                  {d.birthDate ? ` ・ ${d.birthDate}` : ""}
                </a>
                <button type="button" disabled={busy} onClick={() => run({ personId: d.id })} className="rounded border border-amber-400 px-2 py-0.5 text-xs">
                  この人に紐づける
                </button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => run({ createNew: true })} className="mt-2 text-xs underline">
            別人なので、新しい候補者として作る
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => run({})}
          className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] disabled:opacity-50"
          title="候補者一覧に追加し、この案件の候補者 (接続済み) にします。推薦の状況は「書類確認中」になります"
        >
          候補者に取り込む
        </button>
      )}
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
    </div>
  );
}

/* ───────────── 質問 ───────────── */

function QaTab({ questions }: { questions: ManageQuestion[] }) {
  if (questions.length === 0) {
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">質問はまだありません。</p>;
  }
  return (
    <div className="space-y-2">
      {questions.map((q) => (
        <QuestionRow key={q.id} q={q} />
      ))}
    </div>
  );
}

function QuestionRow({ q }: { q: ManageQuestion }) {
  const router = useRouter();
  const [answer, setAnswer] = useState(q.answer);
  const [isPublic, setIsPublic] = useState(q.isPublic);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = answer !== q.answer || isPublic !== q.isPublic;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await send(`/api/board-manage/questions/${q.id}`, "PATCH", { answer, isPublic });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border bg-white p-4 text-sm ${q.answer ? "border-gray-200" : "border-red-200"}`}>
      <p className="text-xs text-gray-500">
        #{q.id} ・ {q.createdAt} ・ {q.partnerName} ・ 案件: {q.dealLabel}
        {q.answer ? ` ・ 回答 ${q.answeredAt}` : " ・ 未回答"}
      </p>
      <p className="mt-1 whitespace-pre-wrap font-medium">Q. {q.question}</p>
      {q.questionJa ? <p className="mt-0.5 whitespace-pre-wrap text-sm">日本語訳: {q.questionJa}</p> : null}
      <textarea className={`${INPUT} mt-2`} rows={2} placeholder="回答" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          全パートナーに公開する（外すと質問したパートナーだけに見える）
        </label>
        {err ? <span className="text-xs text-red-600">{err}</span> : null}
        <button
          type="button"
          disabled={!dirty || busy || !answer.trim()}
          onClick={save}
          className="ml-auto rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          回答を保存
        </button>
      </div>
    </div>
  );
}

/* ───────────── パートナー ───────────── */

function PartnersTab({ partners }: { partners: ManagePartner[] }) {
  const [q, setQ] = useState("");
  const shown = partners.filter((p) => !q.trim() || `${p.name} ${p.country}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">
        「登録済み」にできるのは、職業紹介の許可番号（海外のパートナーは取次機関としての申告）と提携契約を確認したパートナーだけです。
        専用リンクはパートナーごとに違います。漏れたときは「リンクを作り直す」で古いリンクを無効にできます。
      </p>
      <input className={`${INPUT} mb-3 max-w-sm`} placeholder="パートナーを探す" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {shown.map((p) => (
          <PartnerRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

function PartnerRow({ p }: { p: ManagePartner }) {
  const router = useRouter();
  const [license, setLicense] = useState(p.licenseNumber);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await send(`/api/board-manage/partners/${p.id}`, "PATCH", body);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
      <div className="min-w-[180px] flex-1">
        <p className="font-semibold">{p.name}</p>
        <p className="text-xs text-gray-500">{[p.country, p.role, p.relationship].filter(Boolean).join(" ・ ")}</p>
      </div>
      <input
        className="w-56 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        placeholder="許可番号 / 取次機関の申告"
        value={license}
        onChange={(e) => setLicense(e.target.value)}
        onBlur={() => license !== p.licenseNumber && patch({ licenseNumber: license })}
      />
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={p.boardEnabled}
          disabled={busy}
          onChange={(e) => patch({ boardEnabled: e.target.checked, licenseNumber: license })}
        />
        登録済み
      </label>
      {p.boardEnabled ? (
        p.link ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)]"
              onClick={async () => {
                await navigator.clipboard.writeText(p.link).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "コピーしました" : "専用リンクをコピー"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-xs text-gray-500 underline"
              onClick={() => window.confirm("リンクを作り直すと、今のリンクは使えなくなります。よろしいですか？") && patch({ rotateLink: true })}
            >
              リンクを作り直す
            </button>
          </div>
        ) : (
          <button type="button" disabled={busy} className="text-xs underline" onClick={() => patch({ rotateLink: true })}>
            専用リンクを作る
          </button>
        )
      ) : null}
      {err ? <p className="w-full text-xs text-red-600">{err}</p> : null}
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
