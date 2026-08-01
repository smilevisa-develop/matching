import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import JobPostingsClient from "./JobPostingsClient";

export const dynamic = "force-dynamic";

export default async function JobPostingsPage() {
  await requireCurrentAccount();
  const [deals, templates, jobPostings] = await Promise.all([
    prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      include: { company: { select: { name: true } } },
    }),
    prisma.jobPostingTemplate.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.jobPosting.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        deal: { select: { title: true, company: { select: { name: true } } } },
        template: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">求人票作成</h1>
        <p className="mt-1 text-sm text-gray-500">
          求人とテンプレートを選び、元ファイルをAIで取り込んで求人票を作成します。
        </p>
      </div>

      <JobPostingsClient
        deals={deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          companyName: deal.company.name,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          templateUrl: template.templateUrl,
          driveFolderUrl: template.driveFolderUrl,
        }))}
        documents={jobPostings.map((doc) => ({
          id: doc.id,
          title: doc.title,
          status: doc.status,
          documentUrl: doc.documentUrl,
          driveFolderUrl: doc.driveFolderUrl,
          dealTitle: doc.deal?.title ?? null,
          companyName: doc.deal?.company?.name ?? null,
          templateName: doc.template?.name ?? null,
          createdAt: doc.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
