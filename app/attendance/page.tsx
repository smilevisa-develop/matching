import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { readAttendanceWeek, type AttendanceWeek } from "@/lib/portal-attendance";
import RefreshOnFocus from "@/app/components/RefreshOnFocus";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日付 (YYYY-MM-DD) を n 日ずらす */
const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dayOfWeek = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
/** その日を含む週の日曜 (日曜始まり) */
const weekStart = (key: string) => shiftDay(key, -dayOfWeek(key));
const shortDate = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireCurrentAccount();
  const { week } = await searchParams;
  const today = todayJst();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(week ?? "") && !Number.isNaN(Date.parse(`${week}T00:00:00Z`));
  const from = weekStart(valid ? week! : today);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(from, i));

  let data: AttendanceWeek | null = null;
  try {
    data = await readAttendanceWeek(from, 7);
  } catch (e) {
    console.error("出勤表の読み込みに失敗:", e instanceof Error ? e.message : e);
  }

  const navClass =
    "flex h-control items-center rounded-button border border-gray-200 bg-white px-4 text-body text-[var(--color-text-dark)] hover:bg-[var(--color-light)]";

  return (
    <div className="flex flex-col gap-4 p-4 text-[var(--color-text-dark)] md:p-8">
      <RefreshOnFocus />
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-title font-bold">出勤表</h1>
          <p className="text-body">
            {from.slice(0, 4)}年 {shortDate(days[0])} 〜 {shortDate(days[6])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/attendance?week=${shiftDay(from, -7)}`} className={navClass}>
            前の週
          </Link>
          <Link href="/attendance" className={navClass}>
            今週
          </Link>
          <Link href={`/attendance?week=${shiftDay(from, 7)}`} className={navClass}>
            次の週
          </Link>
        </div>
      </div>

      {!data ? (
        <p className="rounded-card border border-gray-200 bg-white p-4 text-body">
          出勤表を読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-gray-200 bg-white">
          <table className="w-full min-w-[1120px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="sticky left-0 z-10 w-name bg-white px-4 py-2 text-left text-body font-semibold">名前</th>
                {days.map((day) => (
                  <th
                    key={day}
                    className={`border-l border-gray-200 px-3 py-2 text-left text-body font-semibold ${
                      day === today ? "bg-[var(--color-primary)] text-white" : ""
                    }`}
                  >
                    {shortDate(day)}（{WEEK_LABELS[dayOfWeek(day)]}）
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id} className="border-b border-gray-200 last:border-b-0">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 align-top text-body font-semibold">{member.name}</td>
                  {days.map((day) => {
                    const cell = data.cells[member.id]?.[day];
                    return (
                      <td
                        key={day}
                        className={`border-l border-gray-200 px-3 py-3 align-top text-body ${
                          day === today ? "bg-[var(--color-light)]" : ""
                        }`}
                      >
                        {cell?.absence && <p className="font-semibold text-red-600">欠勤</p>}
                        {cell?.sched && (
                          <p className="whitespace-nowrap tabular-nums">
                            {cell.sched.start}-{cell.sched.end}
                          </p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
