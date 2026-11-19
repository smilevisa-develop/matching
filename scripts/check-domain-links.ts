/**
 * ドメインを移すときに、外に出したリンクが新旧どちらのドメインでも開けるかを確かめる。
 *
 * 外に出したリンク (企業向けの推薦リスト、記入フォーム、チェックリスト、事前確認資料、日本語チェック、
 * パートナーアンケート・記入フォーム、案件ボードの専用リンク、SNS の相談リンク、LINE で送った画像) は、
 * 出した時点のドメインで残る。
 * 旧ドメインを外すと開けなくなるので、移行の前後にこのスクリプトで全部確かめる。
 *
 * 使い方 (DB は読むだけ。書き込みはしない):
 *   npx tsx scripts/check-domain-links.ts https://matching.smilereach.jp https://app.smilematching.jp
 *   npx tsx scripts/check-domain-links.ts <旧> <新> --all     # 全件 (既定は種類ごとに 20 件)
 *
 * 判定:
 *   - 旧で開けていたリンク (2xx) が、旧・新の両方で同じように開けること
 *   - 旧で開けないリンク (期限切れの画像など) は「もともと開けない」として数えるだけ
 * 1 件でも NG があれば exit code 1。
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ALL = process.argv.includes("--all");
const LIMIT = ALL ? undefined : 20;

if (args.length < 2) {
  console.error("使い方: npx tsx scripts/check-domain-links.ts <旧ドメインのURL> <新ドメインのURL> [--all]");
  process.exit(2);
}
const [OLD, NEW] = args.map((u) => u.replace(/\/+$/, ""));

const connectionString = getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Link = { kind: string; path: string };

/** ログインなしで開けるはずの固定ページ・受け口 (webhook は GET で生きているかだけ見る) */
const FIXED: Link[] = [
  { kind: "固定", path: "/api/health" },
  { kind: "固定", path: "/login" },
  { kind: "固定", path: "/legal/privacy" },
  { kind: "固定", path: "/interview-practice" },
  { kind: "webhook", path: "/api/line/webhook" },
  { kind: "webhook", path: "/api/messenger/webhook" },
  { kind: "webhook", path: "/api/whatsapp/webhook" },
];

async function collectLinks(): Promise<Link[]> {
  const links: Link[] = [...FIXED];
  try {
    await collectIssuedLinks(links);
  } catch (e) {
    console.warn(
      `⚠ DB に接続できなかったので、固定ページだけ確かめます (${(e as Error).message.split("\n")[0]})。\n` +
        "  本番の DATABASE_URL を入れて実行し直すと、実際に送ったリンクも確かめられます。\n",
    );
    process.exitCode = 1; // 全部は確かめられていないので「合格」にしない
  }
  return links;
}

/**
 * 候補者・企業・パートナー・LINE・SNS に実際に出したリンクを DB から集める (読むだけ)。
 * ブランチによってテーブルや列がまだ無いことがあるので、種類ごとに SQL で引き、無ければ飛ばす。
 */
const SOURCES: { kind: string; sql: string; path: (row: Record<string, unknown>) => string }[] = [
  { kind: "企業向けの推薦リスト", sql: `SELECT "shareToken" AS t FROM "Deal" WHERE "shareToken" IS NOT NULL ORDER BY id DESC`, path: (r) => `/list/${r.t}` },
  { kind: "記入フォーム", sql: `SELECT "intakeToken" AS t FROM "Person" WHERE "intakeToken" IS NOT NULL ORDER BY id DESC`, path: (r) => `/intake/${r.t}` },
  { kind: "日本語チェック", sql: `SELECT "japaneseCheckToken" AS t FROM "Person" WHERE "japaneseCheckToken" IS NOT NULL ORDER BY id DESC`, path: (r) => `/japanese-check/${r.t}` },
  { kind: "求人票チェックリスト", sql: `SELECT token AS t FROM "JobChecklistDelivery" ORDER BY id DESC`, path: (r) => `/checklist/${r.t}` },
  { kind: "事前確認資料", sql: `SELECT token AS t FROM "CompanyDocumentDelivery" ORDER BY id DESC`, path: (r) => `/document-check/${r.t}` },
  { kind: "パートナーアンケート", sql: `SELECT "surveyToken" AS t FROM "Partner" WHERE "surveyToken" IS NOT NULL ORDER BY id DESC`, path: (r) => `/partner-survey/${r.t}` },
  { kind: "パートナー記入フォーム", sql: `SELECT "partnerIntakeToken" AS t FROM "CoreSettings" WHERE "partnerIntakeToken" IS NOT NULL`, path: (r) => `/partner-intake/${r.t}` },
  { kind: "案件ボードの専用リンク", sql: `SELECT "boardToken" AS t FROM "Partner" WHERE "boardToken" IS NOT NULL AND "boardEnabled" ORDER BY id DESC`, path: (r) => `/board/enter/${r.t}` },
  // SNS のプロフィールに貼った相談リンク。押されたことのある組み合わせ = 外に出ているリンク
  { kind: "SNS の相談リンク", sql: `SELECT DISTINCT country, platform FROM "SnsLinkClick"`, path: (r) => `/go/${r.country}-${r.platform}` },
  {
    kind: "LINE等で送った画像",
    sql: `SELECT id AS t FROM "UploadedFile" WHERE "expiresAt" IS NULL OR "expiresAt" > now() ORDER BY "createdAt" DESC`,
    path: (r) => `/api/files/${r.t}`,
  },
];

async function collectIssuedLinks(links: Link[]): Promise<void> {
  // DB に一度もつながらなければ、ここで投げて呼び出し元が「固定ページだけ」に切り替える
  await prisma.$queryRawUnsafe("SELECT 1");
  for (const src of SOURCES) {
    try {
      const sql = LIMIT ? `${src.sql} LIMIT ${LIMIT}` : src.sql;
      const rows = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
      rows.forEach((r) => links.push({ kind: src.kind, path: src.path(r) }));
    } catch {
      console.log(`  (${src.kind}: このデータベースには無いので飛ばします)`);
    }
  }
}

/** リダイレクトは追わずに、最初の応答のステータスと転送先を見る */
async function probe(base: string, path: string): Promise<{ status: number; location: string | null }> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      redirect: "manual",
      // 「bot」を名乗る: /go/ の相談リンクは bot のアクセスを数えないので、確認でクリック数が増えない
      headers: { "user-agent": "smile-matching-link-check-bot" },
      signal: AbortSignal.timeout(20000),
    });
    // 本文は読まずに捨てる (画像を全部落とさない)
    await res.body?.cancel();
    return { status: res.status, location: res.headers.get("location") };
  } catch {
    return { status: 0, location: null };
  }
}

const ok = (s: number) => s >= 200 && s < 300;
const isRedirect = (s: number) => s >= 300 && s < 400;

/** 転送先を比べられる形に (同じサイトの中なら、ドメインを除いたパスで比べる) */
function sameTarget(oldLoc: string | null, newLoc: string | null): boolean {
  const norm = (loc: string | null, base: string) => {
    if (!loc) return "";
    const u = new URL(loc, base);
    return u.origin === new URL(base).origin ? `${u.pathname}${u.search}` : u.toString();
  };
  return norm(oldLoc, OLD) === norm(newLoc, NEW);
}

async function main() {
  const links = await collectLinks();
  console.log(`旧: ${OLD}\n新: ${NEW}\n確かめるリンク: ${links.length} 件${ALL ? " (全件)" : " (種類ごとに最大20件)"}\n`);

  const ng: string[] = [];
  const deadBefore: Record<string, number> = {};
  const passed: Record<string, number> = {};

  // 少しずつ並べて投げる (本番に負荷をかけない)
  const CONCURRENCY = 4;
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const batch = links.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (l) => {
        const [o, n] = await Promise.all([probe(OLD, l.path), probe(NEW, l.path)]);
        const label = l.path.length > 60 ? `${l.path.slice(0, 60)}…` : l.path;
        // 転送するリンク (/go/ の相談リンク・/board/enter/ など) は、同じ先に転送されれば合格
        if (isRedirect(o.status)) {
          if (isRedirect(n.status) && sameTarget(o.location, n.location)) {
            passed[l.kind] = (passed[l.kind] ?? 0) + 1;
          } else {
            ng.push(`[${l.kind}] ${label}  旧=${o.status}→${o.location}  新=${n.status}${n.location ? `→${n.location}` : ""}`);
          }
          return;
        }
        if (!ok(o.status)) {
          // 旧ドメインで開けていた形跡がない (期限切れ・削除済みなど)。新でも同じ結果なら問題なし
          if (o.status !== n.status) {
            ng.push(`[${l.kind}] ${label}  旧=${o.status}${o.location ? `→${o.location}` : ""}  新=${n.status}`);
          } else {
            deadBefore[l.kind] = (deadBefore[l.kind] ?? 0) + 1;
          }
          return;
        }
        if (!ok(n.status)) {
          ng.push(`[${l.kind}] ${label}  旧=${o.status}  新=${n.status}${n.location ? `→${n.location}` : ""}`);
          return;
        }
        passed[l.kind] = (passed[l.kind] ?? 0) + 1;
      }),
    );
  }

  console.log("両方で開けた:");
  for (const [k, v] of Object.entries(passed)) console.log(`  ${k}: ${v} 件`);
  if (Object.keys(deadBefore).length) {
    console.log("もともと開けない (旧・新とも同じ結果。移行とは無関係):");
    for (const [k, v] of Object.entries(deadBefore)) console.log(`  ${k}: ${v} 件`);
  }
  if (ng.length) {
    console.log(`\nNG ${ng.length} 件 (旧と新で結果が違う):`);
    ng.forEach((l) => console.log(`  ${l}`));
    process.exitCode = 1;
  } else if (process.exitCode) {
    console.log("\n確かめた分は NG なし。ただし DB のリンクは確かめていません。");
  } else {
    console.log("\nNG なし。");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
