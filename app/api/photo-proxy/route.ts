/**
 * Drive 上の画像をサーバー経由で取得してブラウザに返す proxy。
 *
 * ブラウザから直接 https://drive.google.com/thumbnail?id=... を叩いても、
 * Service Account 所有のプライベートファイルは 403 になる。
 * このエンドポイントは SA 権限で Drive API から画像バイナリを取得し、
 * ブラウザに Content-Type つきで返す。
 *
 * 使い方:
 *   GET /api/photo-proxy?id=<driveFileId>
 *   GET /api/photo-proxy?u=<encoded drive url>   (id を抽出して同じ処理)
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
    if (!id) {
      return new Response("missing id", { status: 400 });
    }

    const drive = await getDriveClient();
    // meta で mimeType を取り、alt=media でバイナリ本体を取得
    const meta = await drive.files.get({
      fileId: id,
      fields: "id,mimeType",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType ?? "image/jpeg";

    const res = await drive.files.get(
      {
        fileId: id,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "arraybuffer" },
    );

    const buf = Buffer.from(res.data as ArrayBuffer);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buf.length),
        // 顔写真は変わらないので長めに cache (URL が変わったら別 id なので OK)
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.warn(
      "photo-proxy error:",
      error instanceof Error ? error.message : error,
    );
    return new Response("proxy error", { status: 500 });
  }
}
