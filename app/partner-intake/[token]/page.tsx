import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PartnerIntakeClient from "./PartnerIntakeClient";

export const dynamic = "force-dynamic";

/**
 * 新規パートナー向けの自己記入フォーム (ログイン不要)。
 * リンクは パートナーリスト → 「自己記入リンクをコピー」で取れる (全員共通の 1 本)。
 */
export default async function PartnerIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();
  const settings = await prisma.coreSettings.findUnique({ where: { id: 1 }, select: { partnerIntakeToken: true } });
  if (!settings?.partnerIntakeToken || settings.partnerIntakeToken !== token) notFound();
  return <PartnerIntakeClient token={token} />;
}
