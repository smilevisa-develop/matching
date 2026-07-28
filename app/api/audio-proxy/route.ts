/**
 * Drive 上の音声をサーバー経由で返す proxy (photo-proxy の音声版)。
 *
 * 日本語チェックの録音は Service Account 所有のプライベートファイルのため、
 * ブラウザから直接は再生できない。ここで SA 権限で取得して返す。
 *
 * GET /api/audio-proxy?id=<driveFileId>
 */

import { google } from "googleapis";
import { extractDriveFileId } from "@/lib/drive-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !key) throw new Error("Google SA 未設定");
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id") ?? "";
    if (!id) {
      const u = searchParams.get("u");
      if (u) id = extractDriveFileId(u) ?? "";
    }
    if (!id) return new Response("missing id", { status: 400 });

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: id,
      fields: "id,mimeType",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType ?? "audio/mpeg";

    const res = await drive.files.get(
      { fileId: id, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buf = Buffer.from(res.data as ArrayBuffer);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buf.length),
        // 録音は差し替えると別 fileId になるので長めに cache してよい
        "Cache-Control": "public, max-age=86400, immutable",
        // 再生時のシークを効かせる
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.warn("audio-proxy error:", error instanceof Error ? error.message : error);
    return new Response("proxy error", { status: 500 });
  }
}
