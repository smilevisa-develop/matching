import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentAccount } from "@/lib/auth";
import { dealGroup, normalizeDealStatus } from "@/lib/deal-stages";
import { compareExternalIdDescendingWithFallback, findExternalIdByName } from "@/lib/company-id-mapping";
import { findFolderByPrefix } from "@/lib/google-docs";
import CompaniesListClient from "./CompaniesListClient";

const COMPANY_ROOT_FOLDER_URL =
  process.env.GOOGLE_COMPANY_FILES_FOLDER_URL?.trim() ||
  "https://drive.google.com/drive/folders/1TEqGDtoQZlLU8bg8c4cWZSNDp7mRwbin";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  await requireCurrentAccount();

  // externalId が未設定の企業に、マッピング (data/company-id-mapping.json) から自動補完
  await autoFillExternalIds();
  // driveFolderUrl が未設定の企業を、企業ルートから externalId プレフィックスで検索して紐付け
  await autoFillCompanyDriveFolders();

  const companies = await prisma.company.findMany({
    include: {
      // 1 企業 = 1 求人。企業を開いたときと同じく最後に更新した求人のステータスを使う
      deals: {
        select: { status: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  // 並び順:
  //   ① 数値プレフィックス付き (02sv 等) → 番号 降順 (大きい番号ほど上)
  //   ② 数値なし (日本語企業名、AD 等) → 数値ブロックの下、あいうえお順
  //   ③ null / 未設定 → 最下段
  const sorted = [...companies].sort((a, b) =>
    compareExternalIdDescendingWithFallback(a.externalId, b.externalId)
  );

  const rows = sorted.map(toRow);
  const active = rows.filter((company) => dealGroup(company.hiringStatus) !== "stopped");
  const stopped = rows.filter((company) => dealGroup(company.hiringStatus) === "stopped");

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">企業一覧</h1>
          <p className="mt-1 text-sm text-gray-500">{companies.length} 件 (募集中 {active.length} / ストップ {stopped.length})</p>
        </div>
        <Link
          href="/companies/new"
          className="shrink-0 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          + 企業を追加
        </Link>
      </div>

      <CompaniesListClient active={active} stopped={stopped} />
    </div>
  );
}

type RawCompany = {
  id: number;
  externalId: string | null;
  name: string;
  industry: string | null;
  hiringStatus: string;
  driveFolderUrl: string | null;
  deals: { status: string }[];
};

function toRow(c: RawCompany) {
  return {
    id: c.id,
    externalId: c.externalId,
    name: c.name,
    industry: c.industry,
    // 求人のステータスが正。求人がまだ無い企業だけ、追加時に選んだ採用状況を使う
    hiringStatus: normalizeDealStatus(c.deals[0]?.status ?? c.hiringStatus),
    driveFolderUrl: c.driveFolderUrl,
  };
}

// セッション内で 1 度だけ実行 (モジュールスコープのフラグ)
let autoFillDone = false;
let autoFillDriveDone = false;

async function autoFillCompanyDriveFolders() {
  if (autoFillDriveDone) return;
  autoFillDriveDone = true;
  try {
    const candidates = await prisma.company.findMany({
      where: {
        driveFolderUrl: null,
        externalId: { not: null },
      },
      select: { id: true, externalId: true, name: true },
    });
    if (candidates.length === 0) return;

    for (const company of candidates) {
      try {
        const found = await findFolderByPrefix({
          parentFolderUrl: COMPANY_ROOT_FOLDER_URL,
          namePrefix: company.externalId!,
        });
        if (!found) continue;
        await prisma.company.update({
          where: { id: company.id },
          data: { driveFolderUrl: found.folderUrl },
        });
      } catch {
        // 1 社失敗しても全体を止めない
      }
    }
  } catch {
    // 一度失敗したら再試行しない (フラグは立てたまま)
  }
}

async function autoFillExternalIds() {
  if (autoFillDone) return;
  autoFillDone = true;
  try {
    const candidates = await prisma.company.findMany({
      where: { externalId: null },
      select: { id: true, name: true },
    });
    if (candidates.length === 0) return;

    // 既に使われている externalId を一括取得して衝突チェック
    const taken = new Set(
      (
        await prisma.company.findMany({
          where: { externalId: { not: null } },
          select: { externalId: true },
        })
      )
        .map((c) => c.externalId)
        .filter((v): v is string => !!v)
    );

    for (const company of candidates) {
      const externalId = findExternalIdByName(company.name);
      if (!externalId || taken.has(externalId)) continue;
      try {
        await prisma.company.update({
          where: { id: company.id },
          data: { externalId },
        });
        taken.add(externalId);
      } catch {
        // 並列更新などは無視
      }
    }
  } catch {
    // 一度失敗したら再試行しない (フラグは立てたまま)
  }
}
