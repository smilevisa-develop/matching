/**
 * Railway のデプロイ時 healthcheck 用 (認証不要)。
 *
 * 以前は healthcheckPath = "/" だったが、"/" は未ログインだと /login へ
 * 307 リダイレクトする。Railway 側がリダイレクトを成功扱いしなくなり、
 * 2026-09 以降のデプロイがすべて「Healthcheck failure」で失敗していた
 * (アプリ自体は正常に起動している)。
 * 起動していれば必ず 200 を返すだけの専用エンドポイントにする。
 * DB には触らない (DB 障害でデプロイ自体が止まるのを避けるため)。
 */

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
