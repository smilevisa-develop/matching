// 土田さんの Mac の自動修正 (tools/fix-runner) が ssh 越しに呼ぶ。アプリのコンテナの中で動かす (ボットのトークンを外に出さない)。
//   node scripts/fix-slack.mjs thread <channel> <threadTs>   … スレッドの投稿を JSON で
//   node scripts/fix-slack.mjs file <url>                     … 添付ファイルを base64 で
//   node scripts/fix-slack.mjs post <channel> <threadTs>      … 標準入力の文をスレッドに投稿
const token = process.env.SLACK_BOT_TOKEN?.trim();
if (!token) { console.error("SLACK_BOT_TOKEN が未設定"); process.exit(1); }
const [cmd, a, b] = process.argv.slice(2);
const api = async (method, body) => {
  const r = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.error}`);
  return j;
};
if (cmd === "thread") {
  // conversations.replies は JSON の本文を受け付けない (invalid_arguments) ので GET で
  const r = await fetch(`https://slack.com/api/conversations.replies?${new URLSearchParams({ channel: a, ts: b, limit: "100" })}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!j.ok) throw new Error(`conversations.replies: ${j.error}`);
  const out = (j.messages ?? []).map((m) => ({
    ts: m.ts, user: m.user ?? m.bot_id ?? "", bot: Boolean(m.bot_id), text: m.text ?? "",
    files: (m.files ?? []).map((f) => ({ name: f.name, mimetype: f.mimetype, url: f.url_private_download ?? f.url_private })),
  }));
  process.stdout.write(JSON.stringify(out));
} else if (cmd === "file") {
  const r = await fetch(a, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`file ${r.status}`);
  process.stdout.write(Buffer.from(await r.arrayBuffer()).toString("base64"));
} else if (cmd === "post") {
  let text = ""; for await (const c of process.stdin) text += c;
  const blocks = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).slice(0, 45)
    .map((t) => ({ type: "section", text: { type: "mrkdwn", text: t.slice(0, 2900) } }));
  await api("chat.postMessage", { channel: a, thread_ts: b, text: text.slice(0, 3000), blocks, unfurl_links: false, unfurl_media: false });
} else {
  console.error("使い方: thread|file|post"); process.exit(1);
}
