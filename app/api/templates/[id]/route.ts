import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const {
      name,
      content,
      whatsappTemplateName,
      whatsappTemplateLang,
      whatsappTemplateParams,
    } = await req.json();
    // メッセージテンプレートは全アカウントで共有
    const template = await prisma.messageTemplate.update({
      where: { id: Number(id) },
      data: {
        name,
        content,
        whatsappTemplateName: whatsappTemplateName || null,
        whatsappTemplateLang: whatsappTemplateLang || null,
        whatsappTemplateParams: whatsappTemplateParams || null,
      },
    });
    return Response.json({ ok: true, template });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    await prisma.messageTemplate.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
