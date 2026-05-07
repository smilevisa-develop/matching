"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CloseButton from "@/app/components/CloseButton";
import DealPicker from "@/app/components/DealPicker";

type Deal = {
  id: number;
  title: string;
  companyName: string;
};

type JobPostingTemplate = {
  id: number;
  name: string;
  templateUrl: string;
  driveFolderUrl: string | null;
};

type JobPostingDoc = {
  id: number;
  title: string;
  status: string;
  documentUrl: string | null;
  driveFolderUrl: string | null;
  dealTitle: string | null;
  companyName: string | null;
  templateName: string | null;
  createdAt: string;
};

type IncomingFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export default function JobPostingsClient({
  deals,
  templates,
  documents: initialDocs,
}: {
  deals: Deal[];
  templates: JobPostingTemplate[];
  documents: JobPostingDoc[];
}) {
  const [documents, setDocuments] = useState(initialDocs);
  const [form, setForm] = useState({
    dealId: deals[0]?.id ? String(deals[0].id) : "",
    templateId: templates[0]?.id ? String(templates[0].id) : "",
    title: "",
  });
  const [uploaderOpen, setUploaderOpen] = useState(false);

  const selectedDeal = useMemo(
    () => deals.find((deal) => String(deal.id) === form.dealId),
    [deals, form.dealId]
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === form.templateId),
    [templates, form.templateId]
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[var(--color-secondary)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-dark)]">求人票を作成</h2>
            <p className="mt-1 text-sm text-gray-500">
              案件とテンプレートを選び、ファイルをAIで取り込んで求人票を作成します。
            </p>
          </div>
          <Link
            href="/settings"
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            テンプレート管理
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] p-5 text-center">
            <p className="text-sm text-gray-500">求人票テンプレートがまだ登録されていません。</p>
            <Link
              href="/settings"
              className="mt-3 inline-block rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              設定でテンプレートを登録
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="1. 案件を選択">
                <DealPicker
                  deals={deals}
                  selectedId={form.dealId}
                  onSelect={(id) => setForm((current) => ({ ...current, dealId: id }))}
                  placeholder="会社名・案件名で検索"
                />
              </Field>
              <Field label="2. テンプレートを選択">
                <select
                  className={INPUT}
                  value={form.templateId}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, templateId: e.target.value }))
                  }
                >
                  <option value="">テンプレートを選択</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="3. 求人票名を入力">
                <input
                  className={INPUT}
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  placeholder={
                    selectedDeal
                      ? `${selectedDeal.companyName} ${selectedDeal.title} 求人票`
                      : "求人票名"
                  }
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!form.dealId || !form.templateId) {
                    alert("案件とテンプレートを選択してください");
                    return;
                  }
                  setUploaderOpen(true);
                }}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                AI取込で作成
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--color-secondary)] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-dark)]">最近作成した求人票</h2>
            <p className="mt-1 text-xs text-gray-500">
              作成済みのDocsと保管フォルダをここから開けます。
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-2xl border border-gray-200 bg-[var(--color-light)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">{doc.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {doc.companyName ?? "-"} / {doc.dealTitle ?? "-"} /{" "}
                    {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {doc.documentUrl ? (
                    <a
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-[var(--color-secondary)] bg-white px-3 py-1 text-xs text-[var(--color-primary)] hover:bg-white/70"
                    >
                      Docsを開く
                    </a>
                  ) : null}
                  {doc.driveFolderUrl ? (
                    <a
                      href={doc.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      保管フォルダ
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {documents.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
              まだ求人票は作成されていません
            </p>
          ) : null}
        </div>
      </section>

      {uploaderOpen && selectedDeal && selectedTemplate ? (
        <JobPostingUploadModal
          deal={selectedDeal}
          template={selectedTemplate}
          title={form.title.trim() || `${selectedDeal.companyName} ${selectedDeal.title} 求人票`}
          onClose={() => setUploaderOpen(false)}
          onCreated={(jobPosting) => {
            setDocuments((prev) => [
              {
                id: jobPosting.id,
                title: jobPosting.title,
                status: jobPosting.status,
                documentUrl: jobPosting.documentUrl ?? null,
                driveFolderUrl: jobPosting.driveFolderUrl ?? null,
                dealTitle: jobPosting.deal?.title ?? null,
                companyName: jobPosting.deal?.company?.name ?? null,
                templateName: jobPosting.template?.name ?? null,
                createdAt: jobPosting.createdAt,
              },
              ...prev,
            ]);
            setUploaderOpen(false);
            setForm((current) => ({ ...current, title: "" }));
          }}
        />
      ) : null}
    </div>
  );
}

// AI 抽出結果のプレビュー用フィールド定義 (テンプレ側の placeholder と一致)
const EXTRACTED_FIELDS: { key: string; label: string }[] = [
  { key: "jobDescription", label: "仕事内容" },
  { key: "workLocation", label: "勤務地" },
  { key: "nearestStation", label: "最寄り駅" },
  { key: "headcount", label: "募集人数" },
  { key: "gender", label: "性別" },
  { key: "nationality", label: "国籍" },
  { key: "workTime1Start", label: "勤務時間1 開始" },
  { key: "workTime1End", label: "勤務時間1 終了" },
  { key: "workTime2Start", label: "勤務時間2 開始" },
  { key: "workTime2End", label: "勤務時間2 終了" },
  { key: "overtime", label: "残業有無" },
  { key: "avgMonthlyOvertime", label: "月平均残業時間" },
  { key: "fixedOvertimeHours", label: "固定残業時間" },
  { key: "fixedOvertimePay", label: "固定残業代" },
  { key: "monthlyGross", label: "月総支給額" },
  { key: "basicSalary", label: "基本給" },
  { key: "salaryCalcMethod", label: "給与計算方法" },
  { key: "perfectAttendance", label: "皆勤手当" },
  { key: "housingAllowance", label: "住宅手当" },
  { key: "nightShiftAllowance", label: "深夜手当" },
  { key: "commuteAllowance", label: "通勤手当" },
  { key: "socialInsurance", label: "社会保険料" },
  { key: "employmentInsurance", label: "雇用保険料" },
  { key: "healthInsurance", label: "健康保険料" },
  { key: "pensionInsurance", label: "厚生年金保険料" },
  { key: "incomeTax", label: "所得税" },
  { key: "residentTax", label: "住民税" },
  { key: "mealProvision", label: "食費支給" },
  { key: "mealAmount", label: "食費金額" },
  { key: "dormProvision", label: "寮の有無" },
  { key: "dormAmount", label: "寮費" },
  { key: "utilitiesProvision", label: "光熱費支給" },
  { key: "utilitiesAmount", label: "光熱費金額" },
  { key: "holidays", label: "休日" },
  { key: "otherBenefits", label: "その他手当" },
  { key: "notes", label: "特記事項" },
];

type ExtractedJobPostingMap = Record<string, string>;

function JobPostingUploadModal({
  deal,
  template,
  title,
  onClose,
  onCreated,
}: {
  deal: Deal;
  template: JobPostingTemplate;
  title: string;
  onClose: () => void;
  onCreated: (jobPosting: {
    id: number;
    title: string;
    status: string;
    documentUrl: string | null;
    driveFolderUrl: string | null;
    createdAt: string;
    deal?: { title?: string | null; company?: { name?: string | null } | null } | null;
    template?: { name?: string | null } | null;
  }) => void;
}) {
  const [files, setFiles] = useState<IncomingFile[]>([]);
  const [stage, setStage] = useState<"upload" | "review">("upload");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedJobPostingMap>({});

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const next: IncomingFile[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name} は 20MB を超えるためアップロードできません`);
        continue;
      }
      const dataUrl = await readAsDataUrl(file);
      next.push({
        id: `${Date.now()}-${file.name}`,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      });
    }
    setFiles((current) => [...current, ...next]);
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  };

  /**
   * AI 取込:
   * - 添付の中に PDF があれば 新パイプライン /api/job-sheet/parse を使う
   *   (ページ分割 + ルール分割 + Gemini セクション抽出 + 正規化)
   * - PDF が無い (画像だけ) なら 旧 /api/job-postings/extract で全部投げ
   */
  const runExtract = async () => {
    if (files.length === 0) {
      alert("求人票の元ファイルをアップロードしてください");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const pdfFile = files.find((f) => f.mimeType === "application/pdf");
      let payload: Record<string, unknown> = {};
      if (pdfFile) {
        // multipart で PDF を 1 件送る
        const blob = await fetch(pdfFile.dataUrl).then((r) => r.blob());
        const formData = new FormData();
        formData.append("file", new File([blob], pdfFile.fileName, { type: pdfFile.mimeType }));
        const parseRes = await fetch("/api/job-sheet/parse", {
          method: "POST",
          body: formData,
        });
        const parseResult = await parseRes.json();
        if (!parseRes.ok || !parseResult.success) {
          setError(parseResult.error || "PDF 解析に失敗しました");
          return;
        }
        // 1 ページ目の mappedJobs を採用 (複数案件 PDF は将来対応)
        const first = (parseResult.mappedJobs ?? [])[0] ?? {};
        payload = first as Record<string, unknown>;
      } else {
        const extractRes = await fetch("/api/job-postings/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: files.map((file) => ({
              fileName: file.fileName,
              dataUrl: file.dataUrl,
            })),
          }),
        });
        const extractResult = await extractRes.json();
        if (!extractRes.ok || !extractResult.ok) {
          setError(extractResult.error || "AI取込に失敗しました");
          return;
        }
        payload = (extractResult.extracted ?? {}) as Record<string, unknown>;
      }

      const normalized: ExtractedJobPostingMap = {};
      for (const field of EXTRACTED_FIELDS) {
        const v = payload[field.key];
        normalized[field.key] = typeof v === "string" ? v : v == null ? "" : String(v);
      }
      setExtracted(normalized);
      setStage("review");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "エラーが発生しました");
    } finally {
      setExtracting(false);
    }
  };

  const createWithExtracted = async () => {
    setCreating(true);
    setError(null);
    try {
      const createRes = await fetch("/api/job-postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          templateId: template.id,
          title,
          ...extracted,
        }),
      });
      const createResult = await createRes.json();
      if (!createRes.ok || !createResult.ok) {
        setError(createResult.error || "求人票の作成に失敗しました");
        return;
      }
      onCreated(createResult.jobPosting);
      alert("求人票を作成しました");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "エラーが発生しました");
    } finally {
      setCreating(false);
    }
  };

  const populatedCount = Object.values(extracted).filter((v) => v && v.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-primary)]">
              AI取込
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--color-text-dark)]">
              求人票ファイルをアップロード
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              候補者の情報取込と同じように、元ファイルを読み取って求人票を作成します。
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] px-4 py-3 text-sm text-gray-600">
          <p>
            案件: <span className="font-medium text-[var(--color-text-dark)]">{deal.companyName} / {deal.title}</span>
          </p>
          <p className="mt-1">
            テンプレート: <span className="font-medium text-[var(--color-text-dark)]">{template.name}</span>
          </p>
          <p className="mt-1">
            作成する求人票名: <span className="font-medium text-[var(--color-text-dark)]">{title}</span>
          </p>
        </div>

        {stage === "upload" ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-[var(--color-secondary)] bg-white p-6">
            <label className="block cursor-pointer text-center">
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                multiple
                onChange={(e) => void addFiles(e.target.files)}
              />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-light)] text-[var(--color-primary)]">
                <UploadIcon />
              </div>
              <p className="mt-4 text-sm font-medium text-[var(--color-text-dark)]">
                PDFや画像ファイルをアップロード
              </p>
              <p className="mt-1 text-xs text-gray-500">
                原本の求人票、求人票スクリーンショット、PDF資料などを読み取れます
              </p>
            </label>

            <div className="mt-5 space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-[var(--color-light)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text-dark)]">
                      {file.fileName}
                    </p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="rounded-lg px-3 py-1 text-xs text-gray-500 hover:bg-white"
                  >
                    削除
                  </button>
                </div>
              ))}
              {files.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                  まだファイルは追加されていません
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
            AI が {populatedCount} / {EXTRACTED_FIELDS.length} 項目を抽出しました。
            内容を確認して、必要があれば修正してから「求人票を作成」を押してください。
            空欄のまま作成すると、その項目はテンプレ上で空文字に置換されます。
          </div>
        )}

        {stage === "review" ? (
          <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3">
            <div className="grid gap-3 md:grid-cols-2">
              {EXTRACTED_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-gray-500">{field.label}</span>
                  <input
                    value={extracted[field.key] ?? ""}
                    onChange={(e) =>
                      setExtracted((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          {stage === "review" ? (
            <button
              type="button"
              onClick={() => setStage("upload")}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ファイル選択に戻る
            </button>
          ) : null}
          {stage === "upload" ? (
            <button
              type="button"
              onClick={() => void runExtract()}
              disabled={extracting || files.length === 0}
              className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {extracting ? "AI 取込中..." : "AI で抽出"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void createWithExtracted()}
              disabled={creating}
              className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {creating ? "作成中..." : "この内容で求人票を作成"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16.5A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5" />
    </svg>
  );
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} の読み込みに失敗しました`));
    reader.readAsDataURL(file);
  });
}

const INPUT =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20";
