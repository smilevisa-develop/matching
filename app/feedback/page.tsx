import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import FeedbackList, { type FeedbackItem } from "./FeedbackList";

export const dynamic = "force-dynamic";

/** 修正依頼の一覧 (土田が見て対応する)。操作担当者は画面右下の「修正依頼」から送る */
export default async function FeedbackPage() {
  await requireCurrentAccount();
  const reports = await prisma.feedbackReport.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const items: FeedbackItem[] = reports.map((r) => ({
    id: r.id,
    accountName: r.accountName ?? "-",
    pageUrl: r.pageUrl,
    body: r.body,
    bodyJa: r.bodyJa,
    imageIds: Array.isArray(r.imageIds) ? (r.imageIds as string[]) : [],
    status: r.status,
    reply: r.reply ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
  return (
    <div className="space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">修正依頼</h1>
        <p className="mt-1 text-sm text-gray-500">操作担当者が画面右下の「修正依頼」から送ったもの。状態と返事は送った本人の「自分の依頼」に出ます。</p>
      </div>
      <FeedbackList initial={items} />
    </div>
  );
}
