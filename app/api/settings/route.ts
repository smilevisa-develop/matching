import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FIXED_QUESTIONS,
  normalizeFixedQuestions,
} from "@/lib/app-settings";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { sanitizeRecommendationColumns } from "@/lib/recommendation-columns";
import { sanitizeMonthlyTargets } from "@/lib/monthly-targets";

export async function GET() {
  try {
    const account = await requireApiAccount();
    const [accountSettings, coreSettings] = await Promise.all([
      prisma.appSettings.findUnique({
        where: { accountId: account.id },
      }),
      prisma.coreSettings.findUnique({
        where: { id: 1 },
      }),
    ]);

    return Response.json({
      ok: true,
      settings: {
        calendarEmbedUrl: accountSettings?.calendarEmbedUrl ?? "",
        calendarLabel: accountSettings?.calendarLabel ?? "",
        fixedQuestions: normalizeFixedQuestions(coreSettings?.fixedQuestions),
        recommendationColumns: sanitizeRecommendationColumns(coreSettings?.recommendationColumns),
        monthlyOfferTarget: coreSettings?.monthlyOfferTarget ?? null,
        monthlyRevenueTarget: coreSettings?.monthlyRevenueTarget ?? null,
        monthlyTargets: sanitizeMonthlyTargets(coreSettings?.monthlyTargets),
        recommendationTemplateUrl: coreSettings?.recommendationTemplateUrl ?? "",
      },
      currentAccount: account,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const account = await requireApiAccount();
    const body = await req.json();
    const nextCalendarEmbedUrl =
      typeof body.calendarEmbedUrl === "string" ? body.calendarEmbedUrl.trim() : undefined;
    const nextCalendarLabel =
      typeof body.calendarLabel === "string" ? body.calendarLabel.trim() : undefined;
    const requestedFixedQuestions =
      body.fixedQuestions !== undefined ? normalizeFixedQuestions(body.fixedQuestions) : undefined;
    const requestedRecommendationColumns =
      body.recommendationColumns !== undefined
        ? sanitizeRecommendationColumns(body.recommendationColumns)
        : undefined;
    function toIntOrNull(value: unknown): number | null | undefined {
      if (value === undefined) return undefined;
      if (value === null || value === "" ) return null;
      const n = Number(String(value).replace(/[,\s]/g, ""));
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }
    const nextMonthlyOfferTarget = toIntOrNull(body.monthlyOfferTarget);
    const nextMonthlyRevenueTarget = toIntOrNull(body.monthlyRevenueTarget);
    const nextMonthlyTargets =
      body.monthlyTargets !== undefined ? sanitizeMonthlyTargets(body.monthlyTargets) : undefined;
    const requestedRecommendationTemplateUrl =
      body.recommendationTemplateUrl !== undefined
        ? typeof body.recommendationTemplateUrl === "string"
          ? body.recommendationTemplateUrl.trim() || null
          : null
        : undefined;

    const accountSettings = await prisma.appSettings.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        calendarEmbedUrl: nextCalendarEmbedUrl ?? null,
        calendarLabel: nextCalendarLabel ?? null,
      },
      update: {
        ...(nextCalendarEmbedUrl !== undefined
          ? { calendarEmbedUrl: nextCalendarEmbedUrl || null }
          : {}),
        ...(nextCalendarLabel !== undefined ? { calendarLabel: nextCalendarLabel || null } : {}),
      },
    });

    // 月次目標は全員が編集できる。それ以外の共通設定は管理者だけ (通常アカウントの値は無視する)
    const isAdmin = account.role === "admin";
    const nextFixedQuestions = isAdmin ? requestedFixedQuestions : undefined;
    const nextRecommendationColumns = isAdmin ? requestedRecommendationColumns : undefined;
    const nextRecommendationTemplateUrl = isAdmin ? requestedRecommendationTemplateUrl : undefined;

    if (
      nextFixedQuestions !== undefined ||
      nextRecommendationColumns !== undefined ||
      nextMonthlyOfferTarget !== undefined ||
      nextMonthlyRevenueTarget !== undefined ||
      nextMonthlyTargets !== undefined ||
      nextRecommendationTemplateUrl !== undefined
    ) {
      await prisma.coreSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          fixedQuestions: nextFixedQuestions ?? DEFAULT_FIXED_QUESTIONS,
          ...(nextRecommendationColumns !== undefined
            ? { recommendationColumns: nextRecommendationColumns }
            : {}),
          ...(nextMonthlyOfferTarget !== undefined
            ? { monthlyOfferTarget: nextMonthlyOfferTarget }
            : {}),
          ...(nextMonthlyRevenueTarget !== undefined
            ? { monthlyRevenueTarget: nextMonthlyRevenueTarget }
            : {}),
          ...(nextMonthlyTargets !== undefined ? { monthlyTargets: nextMonthlyTargets } : {}),
          ...(nextRecommendationTemplateUrl !== undefined
            ? { recommendationTemplateUrl: nextRecommendationTemplateUrl }
            : {}),
        },
        update: {
          ...(nextFixedQuestions !== undefined ? { fixedQuestions: nextFixedQuestions } : {}),
          ...(nextRecommendationColumns !== undefined
            ? { recommendationColumns: nextRecommendationColumns }
            : {}),
          ...(nextMonthlyOfferTarget !== undefined
            ? { monthlyOfferTarget: nextMonthlyOfferTarget }
            : {}),
          ...(nextMonthlyRevenueTarget !== undefined
            ? { monthlyRevenueTarget: nextMonthlyRevenueTarget }
            : {}),
          ...(nextMonthlyTargets !== undefined ? { monthlyTargets: nextMonthlyTargets } : {}),
          ...(nextRecommendationTemplateUrl !== undefined
            ? { recommendationTemplateUrl: nextRecommendationTemplateUrl }
            : {}),
        },
      });
    }

    const coreSettings = await prisma.coreSettings.findUnique({
      where: { id: 1 },
    });

    return Response.json({
      ok: true,
      settings: {
        calendarEmbedUrl: accountSettings.calendarEmbedUrl ?? "",
        calendarLabel: accountSettings.calendarLabel ?? "",
        fixedQuestions: normalizeFixedQuestions(coreSettings?.fixedQuestions),
        recommendationColumns: sanitizeRecommendationColumns(coreSettings?.recommendationColumns),
        monthlyOfferTarget: coreSettings?.monthlyOfferTarget ?? null,
        monthlyRevenueTarget: coreSettings?.monthlyRevenueTarget ?? null,
        monthlyTargets: sanitizeMonthlyTargets(coreSettings?.monthlyTargets),
        recommendationTemplateUrl: coreSettings?.recommendationTemplateUrl ?? "",
      },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: e instanceof AuthError ? e.status : 500 }
    );
  }
}
