"use client";

import { useMemo, useState } from "react";
import CloseButton from "@/app/components/CloseButton";

export const CONDITION_FIELDS: { key: string; label: string; group: string; multiline?: boolean }[] = [
  { key: "title", label: "タイトル", group: "基本" },
  { key: "jobDescription", label: "仕事内容", group: "基本", multiline: true },
  { key: "workLocation", label: "勤務地", group: "基本" },
  { key: "nearestStation", label: "最寄り駅", group: "基本" },
  { key: "headcount", label: "募集人数", group: "基本" },
  { key: "gender", label: "性別", group: "基本" },
  { key: "nationality", label: "国籍", group: "基本" },

  { key: "workTime1Start", label: "勤務開始 1", group: "勤務" },
  { key: "workTime1End", label: "勤務終了 1", group: "勤務" },
  { key: "workTime2Start", label: "勤務開始 2", group: "勤務" },
  { key: "workTime2End", label: "勤務終了 2", group: "勤務" },
  { key: "overtime", label: "残業有無", group: "勤務" },
  { key: "avgMonthlyOvertime", label: "月間平均残業時間", group: "勤務" },
  { key: "fixedOvertimeHours", label: "固定残業時間", group: "勤務" },
  { key: "fixedOvertimePay", label: "固定残業代", group: "勤務" },
  { key: "holidays", label: "休日", group: "勤務" },

  { key: "monthlyGross", label: "月総支給額", group: "給与" },
  { key: "basicSalary", label: "基本給", group: "給与" },
  { key: "salaryCalcMethod", label: "給与計算方法 (月給/時給)", group: "給与" },
  { key: "perfectAttendance", label: "皆勤手当", group: "給与" },
  { key: "housingAllowance", label: "住宅手当", group: "給与" },
  { key: "nightShiftAllowance", label: "深夜手当", group: "給与" },
  { key: "commuteAllowance", label: "通勤手当", group: "給与" },

  { key: "socialInsurance", label: "社会保険料", group: "控除" },
  { key: "employmentInsurance", label: "雇用保険料", group: "控除" },
  { key: "healthInsurance", label: "健康保険料", group: "控除" },
  { key: "pensionInsurance", label: "厚生年金保険料", group: "控除" },
  { key: "incomeTax", label: "所得税", group: "控除" },
  { key: "residentTax", label: "住民税", group: "控除" },

  { key: "mealProvision", label: "食費支給 (有/無)", group: "生活" },
  { key: "mealAmount", label: "食費金額", group: "生活" },
  { key: "dormProvision", label: "寮支給 (有/無)", group: "生活" },
  { key: "dormAmount", label: "寮費金額", group: "生活" },
  { key: "utilitiesProvision", label: "光熱費支給 (有/無)", group: "生活" },
  { key: "utilitiesAmount", label: "光熱費金額", group: "生活" },

  { key: "otherBenefits", label: "その他手当・福利厚生", group: "その他", multiline: true },
  { key: "notes", label: "特記事項", group: "その他", multiline: true },
];

const FIELD_GROUPS = ["基本", "勤務", "給与", "控除", "生活", "その他"];

const CHAT_GPT_PROMPT = `以下の求人票 PDF / 画像を読み取り、構造化されたテキストとして抽出してください。

# 出力ルール
- 各項目を「ラベル: 値」の 1 行形式で出力 (項目間は改行)
- 読み取れない項目は省略 (推測しない)
- 金額は数字のみ (例: 180000)
- 時刻は HH:MM 形式
- 余計な説明文・コードブロック・前置きは不要

# 抽出してほしい項目
タイトル / 仕事内容 / 勤務地 / 最寄り駅 / 募集人数 / 性別 / 国籍 /
勤務開始1 / 勤務終了1 / 勤務開始2 / 勤務終了2 / 残業有無 / 月間平均残業時間 /
固定残業時間 / 固定残業代 / 休日 /
月総支給額 / 基本給 / 給与計算方法(月給/時給) / 皆勤手当 / 住宅手当 / 深夜手当 / 通勤手当 /
社会保険料 / 雇用保険料 / 健康保険料 / 厚生年金保険料 / 所得税 / 住民税 /
食費支給(有/無) / 食費金額 / 寮支給(有/無) / 寮費金額 / 光熱費支給(有/無) / 光熱費金額 /
その他手当・福利厚生 / 特記事項

(以下に対象の求人票を貼り付けてください)`;

export type ConditionsRecord = Record<string, string | null | undefined>;

export default function ConditionsPanel({
  dealId,
  initialConditions,
  onCreateJobPosting,
}: {
  dealId: number;
  initialConditions: ConditionsRecord;
  onCreateJobPosting?: () => void;
}) {
  const [form, setForm] = useState<ConditionsRecord>(() => normalize(initialConditions));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [importMode, setImportMode] = useState<null | "gemini" | "chatgpt">(null);

  const setField = (key: string, value: string) => {
    setForm((cur) => ({ ...cur, [key]: value }));
    setDirty(true);
  };

  const applyExtracted = (extracted: ConditionsRecord) => {
    setForm((cur) => {
      const next = { ...cur };
      for (const [k, v] of Object.entries(extracted)) {
        if (typeof v === "string" && v.trim() !== "") next[k] = v;
      }
      return next;
    });
    setDirty(true);
    setImportMode(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/conditions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: form }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error ?? res.statusText}`);
        return;
      }
      setDirty(false);
      alert("条件を保存しました");
    } finally {
      setSaving(false);
    }
  };

  const populatedCount = useMemo(
    () =>
      Object.values(form).filter((v) => typeof v === "string" && (v as string).trim() !== "")
        .length,
    [form]
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">条件</h3>
            <p className="mt-1 text-xs text-gray-500">
              求人票の元になる条件です。AI で取り込み・手動編集ができます。入力済み: {populatedCount} / {CONDITION_FIELDS.length} 項目
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportMode("gemini")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
            >
              <GeminiIcon /> Gemini で取り込み
            </button>
            <button
              type="button"
              onClick={() => setImportMode("chatgpt")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
            >
              <ChatGptIcon /> ChatGPT から貼り付け
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {saving ? "保存中..." : "条件を保存"}
            </button>
            {onCreateJobPosting ? (
              <button
                type="button"
                onClick={onCreateJobPosting}
                className="rounded-lg border border-[var(--color-primary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                求人票を作成
              </button>
            ) : null}
          </div>
        </div>

        {dirty ? (
          <p className="mt-2 text-[11px] text-[#92400E]">未保存の変更があります</p>
        ) : null}

        <div className="mt-5 space-y-6">
          {FIELD_GROUPS.map((group) => {
            const fields = CONDITION_FIELDS.filter((f) => f.group === group);
            return (
              <div key={group} className="rounded-xl border border-gray-100 bg-[var(--color-light)]/40 p-4">
                <h4 className="text-sm font-semibold text-[var(--color-text-dark)]">{group}</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {f.multiline ? (
                        <textarea
                          value={String(form[f.key] ?? "")}
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full min-h-[88px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                        />
                      ) : (
                        <input
                          value={String(form[f.key] ?? "")}
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {importMode === "gemini" ? (
        <GeminiImportModal onClose={() => setImportMode(null)} onApply={applyExtracted} />
      ) : null}
      {importMode === "chatgpt" ? (
        <ChatGptPasteModal
          prompt={CHAT_GPT_PROMPT}
          onClose={() => setImportMode(null)}
          onApply={applyExtracted}
        />
      ) : null}
    </div>
  );
}

function normalize(input: ConditionsRecord): ConditionsRecord {
  const out: ConditionsRecord = {};
  for (const f of CONDITION_FIELDS) {
    const v = input?.[f.key];
    out[f.key] = typeof v === "string" ? v : "";
  }
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function GeminiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z" fill="#4285F4" />
    </svg>
  );
}

function ChatGptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#10A37F" />
      <path
        d="M8 9.5 C8 8.4 8.9 7.5 10 7.5 L14 7.5 C15.1 7.5 16 8.4 16 9.5 L16 14.5 C16 15.6 15.1 16.5 14 16.5 L10 16.5 C8.9 16.5 8 15.6 8 14.5 Z"
        fill="white"
      />
    </svg>
  );
}

/* ----------------- Gemini PDF/画像 取り込み ----------------- */

function GeminiImportModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (extracted: ConditionsRecord) => void;
}) {
  const [files, setFiles] = useState<{ fileName: string; dataUrl: string }[]>([]);
  const [stage, setStage] = useState<"select" | "extracting">("select");
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (fl: FileList | null) => {
    if (!fl) return;
    const next: { fileName: string; dataUrl: string }[] = [];
    for (const f of Array.from(fl)) {
      if (f.size > 20 * 1024 * 1024) {
        alert(`${f.name} は 20MB を超えるためスキップしました`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      next.push({ fileName: f.name, dataUrl });
    }
    setFiles((p) => [...p, ...next]);
  };

  const run = async () => {
    if (files.length === 0) {
      alert("ファイルを 1 つ以上選択してください");
      return;
    }
    setStage("extracting");
    setError(null);
    try {
      const res = await fetch("/api/job-postings/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "抽出に失敗しました");
        setStage("select");
        return;
      }
      onApply(data.extracted ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setStage("select");
    }
  };

  return (
    <Modal title="Gemini で求人票を取り込み" subtitle="PDF / 画像を読み取り条件に反映します" onClose={onClose}>
      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {stage === "select" ? (
        <>
          <label
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] px-6 py-6 text-center hover:bg-white"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">
              PDF / 画像をドラッグ&ドロップ
            </p>
            <p className="mt-1 text-xs text-gray-500">複数ファイル / 1 ファイル最大 20MB</p>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
          {files.length > 0 ? <p className="mt-2 text-xs text-gray-500">選択中: {files.length} 件</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              キャンセル
            </button>
            <button
              onClick={() => void run()}
              disabled={files.length === 0}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              Gemini で抽出
            </button>
          </div>
        </>
      ) : (
        <Spinner label="Gemini が読み取っています..." />
      )}
    </Modal>
  );
}

/* ----------------- ChatGPT 貼り付け ----------------- */

function ChatGptPasteModal({
  prompt,
  onClose,
  onApply,
}: {
  prompt: string;
  onClose: () => void;
  onApply: (extracted: ConditionsRecord) => void;
}) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<"input" | "extracting">("input");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("クリップボードにコピーできませんでした");
    }
  };

  const run = async () => {
    if (!text.trim()) {
      alert("テキストを貼り付けてください");
      return;
    }
    setStage("extracting");
    setError(null);
    try {
      const res = await fetch("/api/job-postings/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "抽出に失敗しました");
        setStage("input");
        return;
      }
      onApply(data.extracted ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setStage("input");
    }
  };

  return (
    <Modal
      title="ChatGPT から貼り付け"
      subtitle="ChatGPT に求人票を読ませて、抽出されたテキストを下に貼り付けてください"
      onClose={onClose}
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {stage === "input" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-[var(--color-light)] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--color-text-dark)]">ChatGPT 用プロンプト</p>
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--color-primary-hover)]"
              >
                {copied ? "コピーしました" : "プロンプトをコピー"}
              </button>
            </div>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px] leading-relaxed text-gray-700">
              {prompt}
            </pre>
            <p className="mt-2 text-[11px] text-gray-500">
              ※ ChatGPT に上記プロンプトと求人票 (PDF or 画像) を渡し、出力された「ラベル: 値」テキストを下に貼り付けてください。
            </p>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full min-h-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            placeholder="ChatGPT が出力したテキストを貼り付け..."
          />

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              キャンセル
            </button>
            <button
              onClick={() => void run()}
              disabled={!text.trim()}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              この内容を条件に反映
            </button>
          </div>
        </div>
      ) : (
        <Spinner label="貼り付けたテキストから抽出中..." />
      )}
    </Modal>
  );
}

/* ----------------- 共通モーダル / スピナー ----------------- */

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      <p className="mt-3 text-sm font-medium text-[var(--color-text-dark)]">{label}</p>
    </div>
  );
}
