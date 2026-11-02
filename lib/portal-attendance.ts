/**
 * みんなの出勤表 (閲覧のみ)。予定と欠勤を CROSLAN ポータルの DB から直接読む。打刻の実績は出さない。
 *
 * 接続は読み取り専用のロールで、出勤に必要な列だけに権限がある (打刻・メモ・欠勤理由・パスワードなどは読めない)。
 * ポータルと同じ VPS の同じ Docker ネットワークにあるので、外には公開していない。
 * 1 日に複数の予定があるときは、ポータルの画面と同じく最初の 1 件を出す。
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
  const connectionString = process.env.PORTAL_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("PORTAL_DATABASE_URL が未設定です");
  globalForPool.portalPool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  return globalForPool.portalPool;
}

/** DB の値 (UTC) を日本時間にする SQL */
const jst = (column: string) => `(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')`;

/** fromKey (日本時間の日付) から days 日分 */
export async function readAttendanceWeek(fromKey: string, days: number): Promise<AttendanceWeek> {
  const db = pool();
  const range = [fromKey, days];
  const inRange = (column: string) =>
    `${column} >= ($1::timestamp - interval '9 hours') AND ${column} < ($1::timestamp - interval '9 hours' + make_interval(days => $2::int))`;

  const [users, schedules, absences] = await Promise.all([
    db.query<{ id: string; name: string }>(`SELECT id, name FROM "User" WHERE active`),
    db.query<{ userId: string; day: string; start_at: string; end_at: string }>(
      `SELECT "userId", to_char(${jst('"startAt"')}, 'YYYY-MM-DD') AS day,
              to_char(${jst('"startAt"')}, 'HH24:MI') AS start_at, to_char(${jst('"endAt"')}, 'HH24:MI') AS end_at
         FROM "AttendanceSchedule" WHERE ${inRange('"startAt"')} ORDER BY "startAt"`,
      range,
    ),
    // 欠勤は日本時間の 0:00 を UTC で持っていて、終わりの日も含む
    db.query<{ userId: string; from_day: string; to_day: string }>(
      `SELECT "userId", to_char(${jst('"startDate"')}, 'YYYY-MM-DD') AS from_day, to_char(${jst('"endDate"')}, 'YYYY-MM-DD') AS to_day
         FROM "AttendanceAbsence"
        WHERE "startDate" < ($1::timestamp - interval '9 hours' + make_interval(days => $2::int))
          AND "endDate" >= ($1::timestamp - interval '9 hours')`,
      range,
    ),
  ]);

  const cells: AttendanceWeek["cells"] = {};
  const cell = (userId: string, day: string) => ((cells[userId] ??= {})[day] ??= {});
  for (const s of schedules.rows) cell(s.userId, s.day).sched ??= { start: s.start_at, end: s.end_at };
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  for (const ab of absences.rows) {
    for (let i = 0; i < days; i++) {
      const day = new Date(Date.UTC(fy, fm - 1, fd + i)).toISOString().slice(0, 10);
      if (ab.from_day <= day && day <= ab.to_day) cell(ab.userId, day).absence = true;
    }
  }

  return { members: [...users.rows].sort((a, b) => a.name.localeCompare(b.name, "ja")), cells };
}
