"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CloseButton from "@/app/components/CloseButton";

type Template = {
  id: number;
  name: string;
};

export default function CreateResumeButton({
  personId,
  personName,
  englishName,
}: {
  personId: number;
  personName: string;
  englishName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [title, setTitle] = useState<string>("履歴書");
  const [stage, setStage] = useState<"input" | "creating">("input");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<null | {
    documentUrl: string | null;
    driveFolderUrl: string | null;
    title: string;
  }>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/resume-templates")
      .then((r) => r.json())
      .then((d) => {
        const list: Template[] =
          d?.templates?.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })) ?? [];
        setTemplates(list);
        if (list[0] && !templateId) setTemplateId(String(list[0].id));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!templateId) {
      alert("テンプレートを選択してください");
      return;
    }
    setStage("creating");
    setError(null);
    try {
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, templateId: Number(templateId), title }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "作成に失敗しました");
        setStage("input");
        return;
      }
      setCreated({
        documentUrl: data.resume?.documentUrl ?? null,
        driveFolderUrl: data.resume?.driveFolderUrl ?? null,
        title: data.resume?.title ?? title,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setStage("input");
    }
  };

  const close = () => {
    setOpen(false);
    setCreated(null);
    setStage("input");
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="この候補者の履歴書を Docs で作成"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--color-primary)] transition-transform hover:scale-110 hover:bg-[var(--color-light)]"
      >
        <ResumeIcon />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-dark)]">履歴書を作成</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {personName}
                  {englishName ? ` / ${englishName}` : ""} の情報をテンプレに差し込んで Docs を生成します
                </p>
              </div>
              <CloseButton onClick={close} />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error ? (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {created ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-sm text-[#15803D]">
                    「{created.title}」を作成しました
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {created.documentUrl ? (
                      <a
                        href={created.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                      >
                        Docs を開く
                      </a>
                    ) : null}
                    {created.driveFolderUrl ? (
                      <a
                        href={created.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        保管フォルダ
                      </a>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              ) : stage === "creating" ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                  <p className="mt-3 text-sm font-medium text-[var(--color-text-dark)]">
                    Google Docs に履歴書を生成中...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Field label="履歴書テンプレート">
                    <select
                      className={INPUT}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                    >
                      {templates.length === 0 ? (
                        <option value="">テンプレートが登録されていません</option>
                      ) : null}
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {templates.length === 0 ? (
                      <p className="mt-1 text-[11px] text-[#92400E]">
                        設定 → 履歴書テンプレート で先にテンプレを登録してください
                      </p>
                    ) : null}
                  </Field>
                  <Field label="書類名">
                    <input
                      className={INPUT}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="履歴書"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      実際のファイル名は「{`{ID}_{英語名}_${title || "履歴書"}`}」になります
                    </p>
                  </Field>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!templateId}
                      className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                    >
                      作成
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

function ResumeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="11" y2="9" />
    </svg>
  );
}
