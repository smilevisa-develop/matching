import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const { id } = await params;
    const partnerId = Number(id);
    const body = await req.json();
    const field = String(body?.field ?? "");
    const value = String(body?.value ?? "").trim();

    if (!value) {
      return Response.json({ ok: false, error: "紐づけるIDが空です" }, { status: 400 });
    }

    if (field !== "lineUserId" && field !== "messengerPsid" && field !== "whatsappId") {
      return Response.json({ ok: false, error: "対象のフィールドが不正です" }, { status: 400 });
    }

    const data: {
      lineUserId?: string;
      messengerPsid?: string;
      whatsappId?: string;
      linkStatus?: string;
      channel?: string | null;
      preferredChannels?: string | null;
    } = {
      linkStatus: "完了",
    };
    let linkedChannel: string;
    if (field === "lineUserId") {
      data.lineUserId = value;
      linkedChannel = "LINE";
    } else if (field === "messengerPsid") {
      data.messengerPsid = value;
      linkedChannel = "Messenger";
    } else {
      // whatsappId は国コード込みの数字のみ (webhook が保存した waId をそのまま使う)
      data.whatsappId = value.replace(/\D/g, "");
      linkedChannel = "WhatsApp";
    }
    data.channel = linkedChannel;

    // 連絡先を紐づけたら、その連絡手段 (preferredChannels) を自動で ON にする
    // (既存の選択は保持しつつ union で追加)
    const current = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { preferredChannels: true },
    });
    const channelSet = new Set(
      (current?.preferredChannels ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    channelSet.add(linkedChannel);
    data.preferredChannels = [...channelSet].join(",");

    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data,
    });

    return Response.json({ ok: true, partner });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}
