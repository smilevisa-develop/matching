/**
 * みんなの出勤表 (閲覧のみ)。予定と休みを Slack 勤怠 (slack-kintai、2026-11 にポータルから移行) の DB から直接読む。打刻の実績は出さない。
 *
 * 接続は読み取り専用のロールで、出勤表に必要な列だけに権限がある (打刻・メモ・freee のトークンなどは読めない)。
 * 同じ VPS の同じ Docker ネットワークにあるので、外には公開していない。
 * 1 日に複数の予定があるときは、開始が早い 1 件を出す。
 */

import { Pool } from "pg";

export type AttendanceCell = {
  absence?: boolean;
  sched?: { start: string; end: string };
};

export type AttendanceWeek = {
  members: { id: string; name: string }[];
  /** メンバー ID → 日付 (YYYY-MM-DD) → その日の予定・欠勤 */
  cells: Record<string, Record<string, AttendanceCell>>;
};

const globalForPool = globalThis as unknown as { portalPool?: Pool };

function pool(): Pool {
  const connectionString = (process.env.KINTAI_DATABASE_URL ?? process.env.PORTAL_DATABASE_URL)?.trim();
  if (!connectionString) throw new Error("KINTAI_DATABASE_URL が未設定です");
  globalForPool.portalPool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  return globalForPool.portalPool;
}

/** DB の値 (UTC) を日本時間にする SQL */
const jst = (column: string) => `(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')`;

/** fromKey (日本時間の日付) から days 日分。Slack 勤怠 (slack-kintai) の予定表 day_plans を読む (work=出勤予定、off=休み) */
export async function readAttendanceWeek(fromKey: string, days: number): Promise<AttendanceWeek> {
  const db = pool();
  const [users, plans] = await Promise.all([
    db.query<{ id: number; name: string }>(`SELECT id, name FROM members WHERE active ORDER BY sort, id`),
    db.query<{ member_id: number; day: string; kind: string; start_time: string | null; end_time: string | null }>(
      `SELECT member_id, to_char(work_date, 'YYYY-MM-DD') AS day, kind, start_time, end_time
         FROM day_plans
        WHERE work_date >= $1::date AND work_date < $1::date + $2::int
        ORDER BY work_date, start_time`,
      [fromKey, days],
    ),
  ]);

  const cells: AttendanceWeek["cells"] = {};
  const cell = (userId: string, day: string) => ((cells[userId] ??= {})[day] ??= {});
  for (const p of plans.rows) {
    const c = cell(String(p.member_id), p.day);
    if (p.kind === "off") c.absence = true;
    else if (p.kind === "work" && p.start_time && p.end_time) c.sched ??= { start: p.start_time, end: p.end_time };
  }

  return { members: users.rows.map((u) => ({ id: String(u.id), name: u.name })), cells };
}
