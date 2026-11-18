// Slack の修正依頼を自動で直す (土田さんの Mac で 1 分ごとに動く。launchd: jp.smilereach.fix-runner)
//   サーバーの FixRequest から 1 件取り出す → スレッドと添付を読む → Claude Code (土田さんの Max) で直して本番へ → スレッドに返信
// サーバーとは ssh だけでやりとりする (新しい鍵やトークンを作らない)。Slack への投稿はアプリのコンテナの中の scripts/fix-slack.mjs が行う。
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const BASE = path.join(HOME, "smile-fix-runner");
const SSH = ["-i", path.join(HOME, ".ssh/smilereach_xserver"), "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=15", "root@153.115.31.46"];
const DB = "zov7yroph8oge2c5h7qjmsr3";
const APP = "shnbl07ph6wxdm4dcxzvc8hr";
const CLAUDE = path.join(HOME, ".local/bin/claude");
const TIME_LIMIT_MS = 60 * 60 * 1000;

fs.mkdirSync(path.join(BASE, "jobs"), { recursive: true });
const log = (...a) => fs.appendFileSync(path.join(BASE, "runner.log"), `[${new Date().toISOString()}] ${a.join(" ")}\n`);

const ssh = (cmd, input) => execFileSync("ssh", [...SSH, cmd], { input, encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
const sql = (q) => ssh(`docker exec -i ${DB} psql -U postgres -d matching -qAt -F '\t' -v ON_ERROR_STOP=1`, q).trim();
const app = (args, input) => ssh(`C=$(docker ps -q --filter name=${APP} --filter health=healthy | head -1); docker exec -i $C node scripts/fix-slack.mjs ${args}`, input);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// 同時に 1 件だけ
const LOCK = path.join(BASE, "lock");
try {
  const pid = Number(fs.readFileSync(LOCK, "utf8"));
  try { process.kill(pid, 0); process.exit(0); } catch { /* 前のは終わっている */ }
} catch { /* なし */ }
fs.writeFileSync(LOCK, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(LOCK); } catch {} });

// 途中で止まったもの (Mac が寝た等) は積み直す
sql(`UPDATE "FixRequest" SET status='queued' WHERE status='running' AND "startedAt" < now() - interval '2 hours';`);

const row = sql(`UPDATE "FixRequest" SET status='running', "startedAt"=now() WHERE id = (SELECT id FROM "FixRequest" WHERE status='queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, channel, "threadTs", "messageTs";`);
if (!row) process.exit(0);
const [id, channel, threadTs, messageTs] = row.split("\n")[0].split("\t");
log("start", id, channel, threadTs);

const finish = (status, text) => {
  try { app(`post ${channel} ${threadTs}`, text); } catch (e) { log("post failed", id, e.message); }
  sql(`UPDATE "FixRequest" SET status=${q(status)}, result=${q(text.slice(0, 20000))}, "finishedAt"=now() WHERE id=${Number(id)};`);
  log("end", id, status);
};

try {
  const dir = path.join(BASE, "jobs", id);
  fs.mkdirSync(dir, { recursive: true });
  const thread = JSON.parse(app(`thread ${channel} ${threadTs}`));
  const lines = [];
  let n = 0;
  for (const m of thread) {
    const files = [];
    for (const f of m.files ?? []) {
      if (!f.url) continue;
      const name = `${++n}_${(f.name ?? "file").replace(/[^\w.\-]/g, "_")}`;
      try {
        fs.writeFileSync(path.join(dir, name), Buffer.from(app(`file ${q(f.url).replace(/''/g, "'")}`), "base64"));
        files.push(path.join(dir, name));
      } catch (e) { log("file failed", id, e.message); }
    }
    const mark = m.ts === messageTs ? " ← 今回「自動で修正」を押した投稿" : "";
    lines.push(`--- ${m.bot ? "ボット" : `<@${m.user}>`} (ts ${m.ts})${mark}\n${m.text}${files.length ? `\n添付: ${files.join(", ")}` : ""}`);
  }
  fs.writeFileSync(path.join(dir, "thread.txt"), lines.join("\n\n"));

  const prompt = `Slack の修正依頼を自動で対応してください。土田さんが Slack でこの依頼に「自動で修正」を押しました (= 土田さんからの依頼として扱ってよい)。
あなたの最後の返答は、そのままスレッドに投稿されます。

## 依頼のスレッド (Slack, 古い順)
${lines.join("\n\n")}

## やること
- 対象は SMILE MATCHING (リポジトリ /Users/kodaitsuchida/Desktop/SMILELINK/smile-matching、本番 https://matching.smilereach.jp)。メモリの決めごと (自動 push、データの扱い、スプシの行を消さない 等) に従う。
- 作業は ${dir}/wt に git worktree を作って行う (node_modules は元のリポジトリへのシンボリックリンク)。main を pull してから直す。
- 原因を調べて直し、型チェックが通ったら main に push する (= 本番に出る)。Coolify のコンテナが新しいハッシュで healthy になるまで待ち、可能なら動きを確かめる。終わったら worktree を消す。
- 添付の画像はパスを Read で開いて見る。
- 自分で Slack・LINE・メールを送らない (返信はこの仕組みが代わりに投稿する)。パスワードやトークンは触らない。
- データの削除、お金 (請求・支払い) の値の書き換え、依頼があいまいで直し方が決められないときは、変更せずに質問だけ返す。

## 最後の返答 (スレッドに投稿される)
- 依頼した担当者が読む。やさしい日本語で短く。コードの話やファイル名は書かない。
- 直したとき: 1 行目は「✅ 直しました」。何が変わったか・どこで確かめられるか。
- 直していないとき: 1 行目は「❓ 確認させてください」か「⚠️ 直せませんでした」。理由と、何を教えてほしいか。`;
  fs.writeFileSync(path.join(dir, "prompt.txt"), prompt);

  const out = await new Promise((resolve, reject) => {
    const child = spawn(CLAUDE, ["-p", "--output-format", "json", "--dangerously-skip-permissions"], {
      cwd: path.join(HOME, "Desktop"),
      env: { ...process.env, PATH: `${path.join(HOME, ".local/bin")}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("60 分で終わらなかったので止めました")); }, TIME_LIMIT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(dir, "claude.json"), stdout);
      if (stderr) fs.writeFileSync(path.join(dir, "claude.err"), stderr);
      if (code !== 0 && !stdout) reject(new Error(`Claude Code が止まりました (code ${code}) ${stderr.slice(0, 300)}`));
      else resolve(stdout);
    });
    child.stdin.end(prompt);
  });
  let result = "";
  let isError = false;
  try { const j = JSON.parse(out); result = String(j.result ?? ""); isError = Boolean(j.is_error); } catch { result = out; }
  if (!result.trim()) throw new Error("返答が空でした");
  finish(isError || result.startsWith("⚠️") ? "failed" : "done", result.trim());
} catch (e) {
  log("error", id, String(e.message).slice(0, 2000));
  // 細かいエラーは記録だけ (スレッドには出さない)
  finish("failed", "⚠️ 自動で直せませんでした。土田さんが確認します。");
}
