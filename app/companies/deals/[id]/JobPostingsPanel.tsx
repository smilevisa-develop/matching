"use client";

import Link from "next/link";

export type JobPostingRow = {
  id: number;
  title: string;
  status: string;
  documentUrl: string | null;
  driveFolderUrl: string | null;
  templateName: string | null;
  jobDescription: string | null;
  workLocation: string | null;
  headcount: string | null;
  monthlyGross: string | null;
  createdAt: string;
};

export default function JobPostingsPanel({
  dealId,
  initialPostings,
}: {
  dealId: number;
  initialPostings: JobPostingRow[];
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">求人票 作成履歴</h3>
            <p className="mt-1 text-xs text-gray-500">
              この案件で生成された求人票の一覧です。条件タブで設定した内容をもとに新しい求人票を作成できます。
            </p>
          </div>
          <Link
            href={`/job-postings?dealId=${dealId}`}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            求人票を作成
          </Link>
        </div>

        <div className="mt-4 space-y-2">
          {initialPostings.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              求人票はまだ作成されていません
            </p>
          ) : (
            initialPostings.map((posting) => (
              <div
                key={posting.id}
                className="rounded-xl border border-gray-200 bg-[var(--color-light)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">{posting.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {new Date(posting.createdAt).toLocaleDateString("ja-JP")} 作成 /{" "}
                      {posting.templateName ?? "テンプレートなし"} /{" "}
                      {posting.workLocation ?? "勤務地未設定"} / {posting.headcount ?? "人数未定"}名 /{" "}
                      {posting.monthlyGross ? `${posting.monthlyGross}円` : "給与未設定"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-primary)] border border-[var(--color-secondary)]">
                      {posting.status}
                    </span>
                    {posting.documentUrl ? (
                      <a
                        href={posting.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[var(--color-secondary)] bg-white px-3 py-1 text-[11px] text-[var(--color-primary)] hover:bg-white/70"
                      >
                        Docs を開く
                      </a>
                    ) : null}
                    {posting.driveFolderUrl ? (
                      <a
                        href={posting.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        保管場所
                      </a>
                    ) : null}
                  </div>
                </div>
                {posting.jobDescription ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-gray-600 line-clamp-3">
                    {posting.jobDescription}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
