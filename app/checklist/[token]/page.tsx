import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChecklistView, { type ChecklistItemView } from "./ChecklistView";

export const dynamic = "force-dynamic";

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const delivery = await prisma.jobChecklistDelivery.findUnique({
    where: { token },
    select: {
      token: true,
      language: true,
      items: true,
      checkedItems: true,
      company: { select: { name: true } },
    },
  });
  if (!delivery) notFound();

  const items: ChecklistItemView[] = Array.isArray(delivery.items)
    ? (delivery.items as unknown[]).map((r) => {
        const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        return {
          key: typeof o.key === "string" ? o.key : "",
          jaLabel: typeof o.jaLabel === "string" ? o.jaLabel : "",
          jaValue: typeof o.jaValue === "string" ? o.jaValue : "",
          trLabel: typeof o.trLabel === "string" ? o.trLabel : "",
          trValue: typeof o.trValue === "string" ? o.trValue : "",
        };
      }).filter((i) => i.key)
    : [];

  const checkedItems =
    delivery.checkedItems && typeof delivery.checkedItems === "object"
      ? (delivery.checkedItems as Record<string, boolean>)
      : {};

  return (
    <ChecklistView
      token={delivery.token}
      companyName={delivery.company.name}
      items={items}
      initialChecked={checkedItems}
    />
  );
}
