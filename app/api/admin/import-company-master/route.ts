/**
 * 企業マスタ (企業データベース.xlsx の「企業マスタ」タブ) を Company に取り込む (要管理者)。
 *
 * data/company-master.json (企業ID/企業名/分野) を正として:
 *   - 既存 Company の externalId を小文字に統一
 *   - externalId(小文字) で突き合わせ、name / industry をマスタ値に更新
 *   - マスタに在って DB に無い企業は新規作成
 *
 * POST /api/admin/import-company-master?apply=1   実行 (apply 無しはドライラン)
 *
 * マスタ更新時は data/company-master.json を最新の企業マスタから作り直して再実行する。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type MasterCompany = { externalId: string; name: string; industry?: string };

function loadMaster(): MasterCompany[] {
  const file = path.join(process.cwd(), "data", "company-master.json");
  const json = JSON.parse(readFileSync(file, "utf-8"));
  if (!Array.isArray(json)) throw new Error("company-master.json must be an array");
  // externalId は小文字に正規化・重複排除 (後勝ち)
  const byId = new Map<string, MasterCompany>();
  for (const r of json as MasterCompany[]) {
    const externalId = String(r.externalId ?? "").trim().toLowerCase();
    const name = String(r.name ?? "").trim();
    if (!externalId || !name) continue;
    byId.set(externalId, { externalId, name, industry: String(r.industry ?? "").trim() || undefined });
  }
  return [...byId.values()];
}

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const apply = new URL(req.url).searchParams.get("apply") === "1";

    const master = loadMaster();
    const companies = await prisma.company.findMany({
      select: { id: true, externalId: true, name: true, industry: true },
    });
    const byLc = new Map<string, (typeof companies)[number]>();
    for (const c of companies) {
      if (c.externalId) byLc.set(c.externalId.toLowerCase(), c);
    }

    const created: string[] = [];
    const updated: string[] = [];
    let unchanged = 0;

    if (apply) {
      // 既存 externalId を小文字に統一
      for (const c of companies) {
        if (c.externalId && c.externalId !== c.externalId.toLowerCase()) {
          await prisma.company.update({
            where: { id: c.id },
            data: { externalId: c.externalId.toLowerCase() },
          });
        }
      }
    }

    for (const m of master) {
      const d = byLc.get(m.externalId);
      if (!d) {
        created.push(`${m.externalId} ${m.name}`);
        if (apply) {
          await prisma.company.create({
            data: { name: m.name, industry: m.industry ?? null, externalId: m.externalId },
          });
        }
        continue;
      }
      const changed = d.name !== m.name || (d.industry ?? "") !== (m.industry ?? "");
      if (changed) {
        updated.push(`${m.externalId}: ${d.name} → ${m.name}`);
        if (apply) {
          await prisma.company.update({
            where: { id: d.id },
            data: { name: m.name, industry: m.industry ?? null },
          });
        }
      } else {
        unchanged++;
      }
    }

    return Response.json({
      ok: true,
      apply,
      masterCount: master.length,
      createdCount: created.length,
      updatedCount: updated.length,
      unchanged,
      created,
      updated,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
