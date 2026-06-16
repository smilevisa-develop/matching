import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import BulkAddClient from "./BulkAddClient";

export const dynamic = "force-dynamic";

export default async function BulkAddPage() {
  await requireCurrentAccount();
  const partners = await prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, country: true },
  });
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">候補者 一括登録 (AI 解析)</h1>
        <p className="text-sm text-gray-500 mt-1">
          複数の履歴書ファイル (PDF / JPG / PNG, 最大 10 件) をまとめてアップロードし、
          Gemini AI で候補者情報を抽出 → カードで確認・編集 → 一括登録できます。
        </p>
      </div>
      <BulkAddClient partners={partners} />
    </div>
  );
}
