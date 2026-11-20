/**
 * 候補者の面談用 Zoom ミーティングを作り、人材チームのカレンダーに予定を入れる (要ログイン)。
 *
 * GET  /api/personnel/[id]/zoom-meeting → タイトルの初期値と設定状況
 * POST /api/personnel/[id]/zoom-meeting
 *   body: { title, start: "YYYY-MM-DDTHH:mm" (日本時間), durationMin, addToCalendar }
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import {
  buildMeetingTitle,
  createZoomMeeting,
  insertTeamCalendarEvent,
  meetingDescription,
  teamCalendarConfigured,
  zoomConfigured,
} from "@/lib/zoom-meeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return Response.json({ ok: false, error: e.message }, { status: e.status });
  }
  return Response.json(
    { ok: false, error: e instanceof Error ? e.message : "エラーが発生しました" },
    { status: 500 },
  );
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const personId = Number((await ctx.params).id);
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        name: true,
        onboarding: { select: { englishName: true } },
        partner: { select: { name: true } },
        dealCandidates: {
          orderBy: { updatedAt: "desc" },
          select: {
            deal: {
              select: {
                field: true,
                company: { select: { externalId: true, name: true, industry: true } },
              },
            },
          },
        },
      },
    });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }
    const candidateName = person.onboarding?.englishName?.trim() || person.name;
    // 推薦先 (案件) ごとにタイトル案を出す。最新の案件が先頭
    const seen = new Set<string>();
    const titles: { label: string; title: string }[] = [];
    for (const dc of person.dealCandidates) {
      const c = dc.deal.company;
      const title = buildMeetingTitle({
        companyId: c.externalId,
        field: dc.deal.field || c.industry,
        candidateName,
        partnerName: person.partner?.name,
      });
      if (seen.has(title)) continue;
      seen.add(title);
      titles.push({ label: `${c.externalId ?? ""} ${c.name}`.trim(), title });
    }
    if (titles.length === 0) {
      titles.push({
        label: "推薦先なし",
        title: buildMeetingTitle({ candidateName, partnerName: person.partner?.name }),
      });
    }
    return Response.json({
      ok: true,
      titles,
      zoomReady: zoomConfigured(),
      calendarReady: teamCalendarConfigured(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();
    const personId = Number((await ctx.params).id);
    if (!Number.isFinite(personId)) {
      return Response.json({ ok: false, error: "無効なIDです" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      start?: string;
      durationMin?: number;
      addToCalendar?: boolean;
    };
    const title = (body.title ?? "").trim();
    const start = (body.start ?? "").trim();
    const durationMin = Math.min(Math.max(Number(body.durationMin) || 60, 15), 300);
    if (!title) return Response.json({ ok: false, error: "タイトルを入れてください" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)) {
      return Response.json({ ok: false, error: "日時を入れてください" }, { status: 400 });
    }
    if (!zoomConfigured()) {
      return Response.json(
        { ok: false, error: "Zoom の連携がまだ設定されていません (管理者が設定します)" },
        { status: 400 },
      );
    }

    const meeting = await createZoomMeeting({ topic: title, startLocal: start, durationMin });
    const description = meetingDescription(title, start, meeting);

    let calendarLink: string | null = null;
    let calendarError: string | null = null;
    if (body.addToCalendar !== false) {
      if (!teamCalendarConfigured()) {
        calendarError = "人材チームのカレンダーがまだ設定されていません";
      } else {
        try {
          calendarLink = (
            await insertTeamCalendarEvent({
              title,
              startLocal: start,
              durationMin,
              description,
              location: meeting.join_url,
            })
          ).htmlLink;
        } catch (e) {
          console.error("[zoom-meeting] calendar insert failed", e);
          calendarError = "カレンダーに入れられませんでした。Zoom のリンクは作成済みです";
        }
      }
    }

    return Response.json({
      ok: true,
      joinUrl: meeting.join_url,
      meetingId: meeting.id,
      password: meeting.password ?? null,
      invitation: description,
      calendarLink,
      calendarError,
    });
  } catch (e) {
    console.error("[zoom-meeting]", e);
    return errorResponse(e);
  }
}
