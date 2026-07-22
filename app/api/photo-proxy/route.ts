/**
 * Drive 上の画像をサーバー経由で取得してブラウザに返す proxy。
 *
 * ブラウザから直接 https://drive.google.com/thumbnail?id=... を叩いても、
 * Service Account 所有のプライベートファイルは 403 になる。
 * このエンドポイントは SA 権限で Drive API から画像を取得し、
 * ブラウザに Content-Type つきで返す。
 *
 * 配信するもの:
 *   ① Drive 生成のサムネイル (数十 KB)。一覧に数十枚並ぶので既定はこちら
 *   ② 取れなければ原本 (数 MB)。アップロード直後でサムネ未生成のときなど
 *
 * キャッシュ:
 *   サムネイル … 24 時間 immutable (差し替え時は fileId が変わるので古い画像は残らない)
 *   原本       … 10 分。後からサムネイルが生成されたら切り替わるように短くしている
 *
 * 使い方:
 *   GET /api/photo-proxy?id=<driveFileId>
 *   GET /api/photo-proxy?id=<driveFileId>&sz=200   欲しい幅 (64〜1600, 既定 400)
 *   GET /api/photo-proxy?u=<encoded drive url>     (id を抽出して同じ処理)
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

    // ?sz=200 で欲しい幅を指定できる (既定 400)。原本を返すときは無視される
    const size = Math.max(64, Math.min(1600, Number(searchParams.get("sz") ?? 400)));

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: id,
      fields: "id,mimeType,thumbnailLink",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType ?? "image/jpeg";

    // ① Drive が生成したサムネイルを優先。原本 (数 MB) に比べて数十 KB で済む。
    //    thumbnailLink は末尾が =s220 のようなサイズ指定なので、欲しい幅に付け替える。
    const thumbnailLink = meta.data.thumbnailLink;
    if (thumbnailLink) {
      try {
        const sized = thumbnailLink.replace(/=s\d+(-[a-z]+)?$/i, `=s${size}`);
        const thumbRes = await fetch(sized);
        if (thumbRes.ok) {
          const buf = Buffer.from(await thumbRes.arrayBuffer());
          // 中身が空だったり HTML (エラーページ) だったら原本にフォールバック
          const type = thumbRes.headers.get("content-type") ?? "";
          if (buf.length > 0 && type.startsWith("image/")) {
            return new Response(new Uint8Array(buf), {
              status: 200,
              headers: {
                "Content-Type": type,
                "Content-Length": String(buf.length),
                "Cache-Control": "public, max-age=86400, immutable",
                "X-Photo-Source": "thumbnail",
              },
            });
          }
        }
      } catch (e) {
        // サムネイル取得の失敗は致命ではない。原本にフォールバックする
        console.warn(
          "photo-proxy: thumbnail 取得に失敗、原本にフォールバック:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // ② フォールバック: 原本をそのまま返す (アップロード直後でサムネ未生成の場合など)
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
        // ただし原本フォールバック時は、後でサムネが生成される可能性があるので短めにする
        "Cache-Control": "public, max-age=600",
        "X-Photo-Source": "original",
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
