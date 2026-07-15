import { prisma } from "@/lib/prisma";
import { REGISTRANT_OPTIONS } from "@/lib/candidate-profile";
import { buildPersonFolderName, ensurePersonDriveFolder } from "@/lib/google-docs";

export const dynamic = "force-dynamic";

export async function GET() {
  const persons = await prisma.person.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ ok: true, persons });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const incomingRegisteredBy = typeof body.registeredBy === "string" ? body.registeredBy.trim() : "";
    const registeredBy = (REGISTRANT_OPTIONS as readonly string[]).includes(incomingRegisteredBy)
      ? incomingRegisteredBy
      : null;
    const person = await prisma.person.create({
      data: {
        name: body.name,
        photoUrl: body.photoUrl || null,
        nationality: body.nationality,
        residenceStatus: body.residenceStatus,
        partnerId: body.partnerId ? Number(body.partnerId) : null,
        channel: body.channel,
        email: body.email || null,
        registeredBy,
        onboarding: body.englishName
          ? {
              create: {
                englishName: body.englishName || null,
                phoneNumber: body.phoneNumber || null,
              },
            }
          : undefined,
      },
    });

    // Drive フォルダを即時に紐づけ or 作成 (通し番号 ID で命名)
    // 既に "{ID 4桁}_" で始まるフォルダが Drive にあればそれを再利用、無ければ新規作成。
    // 失敗しても Person 作成自体は成功させる (後から /personnel/[id] 保存で再試行される)。
    try {
      const folderName = buildPersonFolderName({
        id: person.id,
        englishName: body.englishName ?? null,
        name: person.name,
      });
      const folder = await ensurePersonDriveFolder({
        existingFolderUrl: null,
        personId: person.id,
        personName: folderName,
      });
      if (folder.folderUrl) {
        await prisma.person.update({
          where: { id: person.id },
          data: { driveFolderUrl: folder.folderUrl },
        });
        person.driveFolderUrl = folder.folderUrl;
      }
    } catch (folderError) {
      console.warn(
        `[personnel POST] driveFolderUrl 設定失敗 id=${person.id}:`,
        folderError instanceof Error ? folderError.message : folderError,
      );
    }

    return Response.json({ ok: true, person });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
