import Link from "next/link";
import { readCompanyContacts } from "@/lib/company-contacts";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import DealDetailClient from "./DealDetailClient";
import DealTabs from "./DealTabs";
import JobPostingsPanel from "./JobPostingsPanel";
import ConditionsPanel, { type ConditionsRecord } from "./ConditionsPanel";
import CompanyDocumentsPanel from "./CompanyDocumentsPanel";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import { normalizeDealStatus } from "@/lib/deal-stages";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentAccount();
  const { id } = await params;
  const [deal, persons, jobPostings, jobPostingTemplates, staffOptions, siblingDeals] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: Number(id) },
      include: {
        company: { select: { id: true, name: true, externalId: true, supportType: true, companyKind: true, supportMethod: true, contacts: true } },
        owner: { select: { id: true, name: true } },
        candidates: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                nationality: true,
                residenceStatus: true,
                photoUrl: true,
                partner: { select: { id: true, name: true } },
                onboarding: { select: { englishName: true } },
              },
            },
          },
          orderBy: [{ updatedAt: "desc" }],
        },
      },
    }),
    prisma.person.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        nationality: true,
        residenceStatus: true,
        photoUrl: true,
      },
    }),
    prisma.jobPosting.findMany({
      where: { dealId: Number(id) },
      include: { template: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobPostingTemplate.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    // 求人情報の「担当者」の選択肢
    prisma.staffAccount.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true } }),
    // 同じ企業の求人 (1 社で複数の案件を募集していることがある。2026/10 採用チームの依頼)
    prisma.deal
      .findUnique({ where: { id: Number(id) }, select: { companyId: true } })
      .then((d) =>
        d
          ? prisma.deal.findMany({
              where: { companyId: d.companyId },
              orderBy: { createdAt: "asc" },
              select: { id: true, title: true, status: true, _count: { select: { candidates: true } } },
            })
          : [],
      ),
  ]);

  if (!deal) notFound();

  const syncKey = [
    deal.updatedAt.getTime(),
    ...deal.candidates.map((c) => `${c.id}:${c.stage}`),
  ].join("|");

  return (
    <div className="space-y-6 p-8">
      <RefreshOnFocus />
      <div>
        <Link href="/companies" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
          ← 企業一覧
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-dark)]">{deal.company.name}</h1>
        <p className="mt-1 text-sm text-gray-500">この企業の求人条件・求人票・候補者をまとめて管理します。</p>
        {/* この企業の案件一覧。複数あれば切り替え、「+ 案件を追加」で同じ企業に別の求人を作る */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {siblingDeals.map((d) => (
            <Link
              key={d.id}
              href={`/companies/deals/${d.id}`}
              aria-current={d.id === deal.id ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                d.id === deal.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              }`}
            >
              <span className="max-w-[16rem] truncate">{d.title}</span>
              <span className={`text-[10px] ${d.id === deal.id ? "text-white/80" : "text-gray-400"}`}>
                {normalizeDealStatus(d.status)}・{d._count.candidates}名
              </span>
            </Link>
          ))}
          <Link
            href={`/companies/deals/new?companyId=${deal.company.id}`}
            className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            + 案件を追加
          </Link>
        </div>
      </div>

      <DealTabs
        progressContent={
          <DealDetailClient
            // 進捗管理など別の画面で数字・候補者の状態が変わったら、最新の内容で作り直す
            key={syncKey}
            deal={{
              id: deal.id,
              title: deal.title,
              field: deal.field,
              company: { ...deal.company, contacts: readCompanyContacts(deal.company.contacts) },
              owner: deal.owner,
              status: deal.status,
              unitPrice: deal.unitPrice,
              deadline: deal.deadline?.toISOString() ?? null,
              acceptedAt: deal.acceptedAt?.toISOString() ?? null,
              requiredCount: deal.requiredCount,
              recommendedCount: deal.recommendedCount,
              interviewCount: deal.interviewCount,
              offerCount: deal.offerCount,
              contractCount: deal.contractCount,
              declineCount: deal.declineCount,
              rejectCount: deal.rejectCount,
              notes: deal.notes,
              candidates: deal.candidates.map((candidate) => ({
                id: candidate.id,
                note: candidate.note,
                stage: candidate.stage,
                person: {
                  id: candidate.person.id,
                  name: candidate.person.name,
                  englishName: candidate.person.onboarding?.englishName ?? null,
                  nationality: candidate.person.nationality,
                  residenceStatus: candidate.person.residenceStatus,
                  photoUrl: candidate.person.photoUrl,
                  partner: candidate.person.partner,
                },
              })),
            }}
            persons={persons}
            staffOptions={staffOptions}
          />
        }
        conditionContent={
          <div className="space-y-6">
            <ConditionsPanel
              dealId={deal.id}
              initialConditions={(deal.conditions ?? {}) as ConditionsRecord}
              templates={jobPostingTemplates}
              defaultJobPostingTitle={`${deal.company.name} ${deal.title} 求人票`}
            />
            {/* 事前確認資料 (内定後に候補者へ母国語で確認してもらう) */}
            <CompanyDocumentsPanel companyId={deal.company.id} />
          </div>
        }
        jobPostingContent={
          <JobPostingsPanel
            dealId={deal.id}
            initialPostings={jobPostings.map((posting) => ({
              id: posting.id,
              title: posting.title,
              status: posting.status,
              documentUrl: posting.documentUrl,
              driveFolderUrl: posting.driveFolderUrl,
              templateName: posting.template?.name ?? null,
              jobDescription: posting.jobDescription,
              workLocation: posting.workLocation,
              headcount: posting.headcount,
              monthlyGross: posting.monthlyGross,
              createdAt: posting.createdAt.toISOString(),
            }))}
          />
        }
      />
    </div>
  );
}
