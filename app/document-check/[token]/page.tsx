import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseDeliveryItems } from "@/lib/company-document";
import DocumentCheckView from "./DocumentCheckView";
import { isDevPreview } from "@/lib/dev-preview";
import { SAMPLE_COMPANY_NAME, SAMPLE_DOCUMENT_ITEMS, SAMPLE_DOCUMENT_TITLE } from "@/lib/dev-preview-samples";
import DevPreviewBanner from "@/app/components/DevPreviewBanner";

export const dynamic = "force-dynamic";

/**
 * 事前確認資料の公開ページ (未ログイン、token 認証)。
 * 内定後に企業から渡された資料を、母国語 + 日本語で候補者に確認してもらう。
 */
export default async function DocumentCheckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (await isDevPreview(token)) {
    return (
      <>
        <DevPreviewBanner />
        <DocumentCheckView
          preview
          token={token}
          language="vi"
          documentTitle={SAMPLE_DOCUMENT_TITLE}
          companyName={SAMPLE_COMPANY_NAME}
          items={SAMPLE_DOCUMENT_ITEMS}
          initialChecked={{}}
          initialUnclear={{}}
        />
      </>
    );
  }
  if (!token || token.length < 8) notFound();

  const delivery = await prisma.companyDocumentDelivery.findUnique({
    where: { token },
    select: {
      token: true,
      language: true,
      items: true,
      checkedItems: true,
      unclearItems: true,
      document: { select: { title: true, company: { select: { name: true } } } },
    },
  });
  if (!delivery) notFound();

  const toFlags = (v: unknown): Record<string, boolean> => {
    const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(src)) if (val === true) out[k] = true;
    return out;
  };

  return (
    <DocumentCheckView
      token={delivery.token}
      language={delivery.language}
      documentTitle={delivery.document.title}
      companyName={delivery.document.company.name}
      items={parseDeliveryItems(delivery.items)}
      initialChecked={toFlags(delivery.checkedItems)}
      initialUnclear={toFlags(delivery.unclearItems)}
    />
  );
}
