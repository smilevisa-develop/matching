/**
 * 内定者ごとの Drive フォルダ (2026/10 採用チームの依頼「内定者管理の改善」)。
 *
 *   企業フォルダ (55sv_株式会社イワタ) / 内定者 / ROHMAT SUTANTO
 *
 * 企業フォルダが無ければ作る (企業ID_企業名)。その中の「内定者」フォルダ、さらに英語名のフォルダを
 * 探して、無ければ作る。名前は空白・アクセント記号・大文字小文字の違いを無視して探す (手で作った既存フォルダを使う)。
 */

import { prisma } from "@/lib/prisma";
import { ensureCompanyDriveFolder, getGoogleClients, listChildFolders } from "@/lib/google-docs";

const OFFERED_FOLDER_NAME = "内定者";

const normName = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "D").toUpperCase().replace(/[\s　_]/g, "");

async function findOrCreateChild(parentUrl: string, name: string): Promise<string> {
  const children = await listChildFolders(parentUrl);
  const hit = children.find((f) => normName(f.name) === normName(name));
  if (hit) return `https://drive.google.com/drive/folders/${hit.id}`;
  const parentId = parentUrl.match(/folders\/([a-zA-Z0-9-_]+)/)?.[1] ?? parentUrl;
  const { drive } = await getGoogleClients();
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`フォルダ「${name}」を作れませんでした`);
  return `https://drive.google.com/drive/folders/${created.data.id}`;
}

/** 内定者フォルダを用意して URL を返す (既にあればそれを返す) */
export async function ensurePlacementFolder(placementId: number): Promise<{ folderUrl: string | null; reason?: string }> {
  const p = await prisma.personPlacement.findUnique({
    where: { id: placementId },
    select: {
      driveFolderUrl: true,
      externalName: true,
      externalCompanyName: true,
      person: {
        select: {
          name: true,
          onboarding: { select: { englishName: true } },
          dealCandidates: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { deal: { select: { company: { select: { id: true, name: true, externalId: true, driveFolderUrl: true } } } } },
          },
        },
      },
    },
  });
  if (!p) return { folderUrl: null, reason: "内定者が見つかりません" };
  if (p.driveFolderUrl) return { folderUrl: p.driveFolderUrl };

  const personName = (p.person?.onboarding?.englishName?.trim() || p.person?.name || p.externalName || "").trim();
  if (!personName) return { folderUrl: null, reason: "名前がありません" };

  // 企業: 候補者なら最新のカンバンの企業。候補者とは別に追加した人は、企業名が一致する企業
  let company = p.person?.dealCandidates[0]?.deal.company ?? null;
  if (!company && p.externalCompanyName?.trim()) {
    company = await prisma.company.findFirst({
      where: { name: p.externalCompanyName.trim() },
      select: { id: true, name: true, externalId: true, driveFolderUrl: true },
    });
  }
  if (!company) return { folderUrl: null, reason: "企業が分からないのでフォルダを作れません (企業名をシステムの企業名と同じにしてください)" };

  const companyFolder = await ensureCompanyDriveFolder({
    existingFolderUrl: company.driveFolderUrl,
    externalId: company.externalId,
    companyName: company.name,
  });
  if (!company.driveFolderUrl && companyFolder.folderUrl) {
    await prisma.company.update({ where: { id: company.id }, data: { driveFolderUrl: companyFolder.folderUrl } });
  }
  const offeredUrl = await findOrCreateChild(companyFolder.folderUrl, OFFERED_FOLDER_NAME);
  const personUrl = await findOrCreateChild(offeredUrl, personName);
  await prisma.personPlacement.update({ where: { id: placementId }, data: { driveFolderUrl: personUrl } });
  return { folderUrl: personUrl };
}
