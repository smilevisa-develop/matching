/**
 * Drive 上の音声をサーバー経由で返す proxy (photo-proxy の音声版)。
 *
 * 日本語チェックの録音は Service Account 所有のプライベートファイルのため、
 * ブラウザから直接は再生できない。ここで SA 権限で取得して返す。
 *
 * GET /api/audio-proxy?id=<driveFileId>
 *
 * Range リクエストに対応している点が重要。
 * Safari (iOS/macOS) は <audio> の再生時に必ず `Range: bytes=0-` を送り、
 * 206 Partial Content が返らないと再生を始めない。以前は Accept-Ranges だけ
 * 宣言して Range を無視した 200 を返していたため、Safari で再生できなかった。
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

/** "bytes=0-" / "bytes=100-200" を解釈する。壊れていれば null */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  // 末尾 N バイト指定 (bytes=-500)
  if (rawStart === "") {
    const len = Number(rawEnd);
    if (!Number.isFinite(len) || len <= 0) return null;
    return { start: Math.max(0, size - len), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return null;
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end };
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
    // Drive は webm/mp4 の音声を application/octet-stream で持っていることがある。
    // その場合ブラウザが再生できないので audio/webm に寄せる。
    const rawMime = meta.data.mimeType ?? "";
    const mimeType =
      rawMime.startsWith("audio/") || rawMime.startsWith("video/") ? rawMime : "audio/webm";

    const res = await drive.files.get(
      { fileId: id, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buf = Buffer.from(res.data as ArrayBuffer);

    const commonHeaders = {
      "Content-Type": mimeType,
      // 録音は差し替えると別 fileId になるので長めに cache してよい
      "Cache-Control": "public, max-age=86400, immutable",
      "Accept-Ranges": "bytes",
    };

    // Safari は Range を要求する。206 を返さないと再生が始まらない。
    const range = parseRange(req.headers.get("range"), buf.length);
    if (range) {
      const slice = buf.subarray(range.start, range.end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Range": `bytes ${range.start}-${range.end}/${buf.length}`,
          "Content-Length": String(slice.length),
        },
      });
    }

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { ...commonHeaders, "Content-Length": String(buf.length) },
    });
  } catch (error) {
    console.warn("audio-proxy error:", error instanceof Error ? error.message : error);
    return new Response("proxy error", { status: 500 });
  }
}
