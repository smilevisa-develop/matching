import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireCurrentAccount();
  // 連絡テンプレートは全アカウント共通
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">連絡テンプレート</h1>
      <p className="text-sm text-gray-500">候補者や海外パートナーに送る定型文を全員で共有します。</p>
      <TemplatesClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          content: t.content,
          whatsappTemplateName: t.whatsappTemplateName,
          whatsappTemplateLang: t.whatsappTemplateLang,
          whatsappTemplateParams: t.whatsappTemplateParams,
        }))}
      />
    </div>
  );
}
