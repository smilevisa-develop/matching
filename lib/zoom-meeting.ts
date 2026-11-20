/**
 * 候補者の面談用に Zoom ミーティングを作り、人材チームの Google カレンダーに予定を入れる。
 *
 * Zoom: Server-to-Server OAuth アプリ (Zoom Marketplace で作る) の 3 つの値を環境変数に入れる。
 *   ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET
 *   ZOOM_HOST_EMAIL … ミーティングの主催者 (人材チームの Zoom アカウントのメールアドレス)
 *   アプリの権限 (scope): meeting:write:meeting:admin (または meeting:write:admin)
 *
 * カレンダー: 既存のサービスアカウント (GOOGLE_SERVICE_ACCOUNT_EMAIL) で書く。
 *   GOOGLE_TEAM_CALENDAR_ID … 人材チームのカレンダー ID
 *   カレンダー側で、サービスアカウントに「予定の変更」権限を共有しておく。
 *
 * タイトルの決まり (人材チームの運用): 【{企業ID}{分野}_{候補者名(ローマ字)}】_{パートナー名}
 *   例: 【75sv外食_Su Latt Naing】_MHR / 【24sv大阪_LUONG NGOC KHOA】_SD GROUP
 */

import { google } from "googleapis";

const TZ = "Asia/Tokyo";

export function zoomConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID?.trim() &&
      process.env.ZOOM_CLIENT_ID?.trim() &&
      process.env.ZOOM_CLIENT_SECRET?.trim(),
  );
}

export function teamCalendarConfigured() {
  return Boolean(process.env.GOOGLE_TEAM_CALENDAR_ID?.trim());
}

/** "【MM】MHRマネジメント_CR" → "MHRマネジメント" / "【VN】SD GROUP VN_CR" → "SD GROUP VN" */
export function shortPartnerName(name: string | null | undefined): string {
  let s = (name ?? "").trim();
  s = s.replace(/^【[^】]*】\s*/, "");
  s = s.replace(/[\s_＿]*(CR|CROSLAN)\s*$/i, "");
  s = s.replace(/[_＿\s]+$/, "");
  return s.trim();
}

/** 分野を短くする: "外食業" → "外食" */
export function shortField(field: string | null | undefined): string {
  return (field ?? "").trim().replace(/業$/, "");
}

export function buildMeetingTitle(input: {
  companyId?: string | null;
  field?: string | null;
  candidateName: string;
  partnerName?: string | null;
}): string {
  const head = `${(input.companyId ?? "").trim()}${shortField(input.field)}`;
  const inner = head ? `${head}_${input.candidateName.trim()}` : input.candidateName.trim();
  const partner = shortPartnerName(input.partnerName);
  return `【${inner}】${partner ? `_${partner}` : ""}`;
}

type ZoomMeeting = {
  id: number;
  join_url: string;
  password?: string;
};

async function zoomToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID!.trim();
  const basic = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID!.trim()}:${process.env.ZOOM_CLIENT_SECRET!.trim()}`,
  ).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; reason?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoom の認証に失敗しました (${res.status} ${json.reason ?? ""})`.trim());
  }
  return json.access_token;
}

/** "2026-11-20T15:45" (日本時間) */
export async function createZoomMeeting(input: {
  topic: string;
  startLocal: string;
  durationMin: number;
}): Promise<ZoomMeeting> {
  const token = await zoomToken();
  const host = process.env.ZOOM_HOST_EMAIL?.trim() || "me";
  const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(host)}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.topic,
      type: 2,
      start_time: `${input.startLocal.slice(0, 16)}:00`,
      timezone: TZ,
      duration: input.durationMin,
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as ZoomMeeting & { message?: string };
  if (!res.ok || !json.join_url) {
    throw new Error(`Zoom ミーティングを作れませんでした (${res.status} ${json.message ?? ""})`.trim());
  }
  return json;
}

function formatMeetingId(id: number) {
  const s = String(id);
  return s.length === 11 ? `${s.slice(0, 3)} ${s.slice(3, 7)} ${s.slice(7)}` : s.replace(/(\d{3})(\d{4})(\d+)/, "$1 $2 $3");
}

/** カレンダーの説明欄 (Zoom の招待文と同じ並び) */
export function meetingDescription(topic: string, startLocal: string, m: ZoomMeeting) {
  const [d, t] = startLocal.split("T");
  const [y, mo, da] = d.split("-");
  const [hh, mm] = t.split(":").map(Number);
  const ampm = hh < 12 ? "AM" : "PM";
  const h12 = String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, "0");
  const lines = [
    `トピック: ${topic}`,
    `時刻: ${y}年${Number(mo)}月${Number(da)}日 ${h12}:${String(mm).padStart(2, "0")} ${ampm} 大阪、札幌、東京`,
    "",
    "Zoom ミーティングに参加する",
    m.join_url,
    "",
    `ミーティングID: ${formatMeetingId(m.id)}`,
  ];
  if (m.password) lines.push(`パスコード: ${m.password}`);
  return lines.join("\n");
}

function addMinutes(startLocal: string, min: number) {
  // 日本時間の文字列のまま足す (UTC を経由して時差を崩さない)
  const base = new Date(`${startLocal.slice(0, 16)}:00Z`);
  base.setUTCMinutes(base.getUTCMinutes() + min);
  return base.toISOString().slice(0, 19);
}

export async function insertTeamCalendarEvent(input: {
  title: string;
  startLocal: string;
  durationMin: number;
  description: string;
  location?: string;
}): Promise<{ htmlLink: string | null }> {
  const calendarId = process.env.GOOGLE_TEAM_CALENDAR_ID!.trim();
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  await auth.authorize();
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { dateTime: `${input.startLocal.slice(0, 16)}:00`, timeZone: TZ },
      end: { dateTime: addMinutes(input.startLocal, input.durationMin), timeZone: TZ },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
    },
  });
  return { htmlLink: res.data.htmlLink ?? null };
}
