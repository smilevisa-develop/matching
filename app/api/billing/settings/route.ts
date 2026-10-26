import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

/** 請求の経理担当を選ぶ (請求管理ページ)。POST { billingOwnerId: number | null } */
export async function POST(req: Request) {
  try {
    await requireApiAccount();
    const body = await req.json();
    const id = Number(body.billingOwnerId);
    const billingOwnerId = Number.isFinite(id) && id > 0 ? id : null;
    await prisma.coreSettings.upsert({
      where: { id: 1 },
      create: { id: 1, billingOwnerId },
      update: { billingOwnerId },
    });
    // まだ終わっていない経理担当のタスクの担当名も付け替える
    const owner = billingOwnerId ? await prisma.staffAccount.findUnique({ where: { id: billingOwnerId }, select: { name: true } }) : null;
    if (owner) {
      await prisma.placementTask.updateMany({
        where: { doneAt: null, billingStep: { in: ["invoice", "payment", "pa-payment"] } },
        data: { owner: owner.name },
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 },
    );
  }
}
