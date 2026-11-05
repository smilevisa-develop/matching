import { getAccountSettings, getCoreSettings } from "@/lib/app-settings";
import { requireCurrentAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SettingsClient from "./SettingsClient";
import { getMetaConnection } from "@/lib/sns-meta-connect";
import { getTiktokConnection } from "@/lib/sns-tiktok";
import MetaConnect from "./MetaConnect";
import TiktokConnect from "./TiktokConnect";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ meta?: string; tiktok?: string }> }) {
  const account = await requireCurrentAccount();
  const { meta: metaResult, tiktok: tiktokResult } = await searchParams;
  const isAdmin = account.role === "admin";
  const [metaConn, tiktokConn] = await Promise.all([isAdmin ? getMetaConnection() : null, isAdmin ? getTiktokConnection() : null]);
  const [settings, coreSettings, accounts, resumeTemplates, jobPostingTemplates] = await Promise.all([
    getAccountSettings(account.id),
    getCoreSettings(),
    account.role === "admin"
      ? prisma.staffAccount.findMany({
          orderBy: [{ role: "asc" }, { loginId: "asc" }],
          select: {
            id: true,
            loginId: true,
            name: true,
            role: true,
          },
        })
      : Promise.resolve([]),
    prisma.resumeTemplate.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.jobPostingTemplate.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          カレンダー、自分用テンプレートの基盤、管理者向けの共通設定をここで管理します。
        </p>
      </div>
      <SettingsClient
        currentAccount={account}
        initialSettings={{
          ...settings,
          fixedQuestions: coreSettings.fixedQuestions,
          recommendationColumns: coreSettings.recommendationColumns,
          monthlyOfferTarget: coreSettings.monthlyOfferTarget,
          monthlyRevenueTarget: coreSettings.monthlyRevenueTarget,
          monthlyTargets: coreSettings.monthlyTargets,
          recommendationTemplateUrl: coreSettings.recommendationTemplateUrl ?? "",
        }}
        accounts={accounts}
        resumeTemplates={resumeTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          templateUrl: template.templateUrl,
          driveFolderUrl: template.driveFolderUrl,
        }))}
        jobPostingTemplates={jobPostingTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          templateUrl: template.templateUrl,
          driveFolderUrl: template.driveFolderUrl,
        }))}
      />
      {isAdmin && metaConn && tiktokConn ? (
        <section id="sns" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">SNS 連携（管理者）</h2>
          <p className="mt-1 text-sm text-gray-500">
            <a href="/sns" className="text-[var(--color-primary)] hover:underline">SNS ページ</a> に出す Facebook / Instagram / TikTok の接続。YouTube は API キーをサーバーの環境変数で設定
          </p>
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">Meta（Facebook / Instagram）</h3>
              <MetaConnect
                appId={metaConn.appId}
                hasSecret={metaConn.hasSecret}
                connected={metaConn.connected}
                expiresAt={metaConn.expiresAt?.toISOString() ?? null}
                result={metaResult ?? null}
              />
            </div>
            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">TikTok</h3>
              <TiktokConnect clientKey={tiktokConn.clientKey} hasSecret={tiktokConn.hasSecret} accounts={tiktokConn.accounts} result={tiktokResult ?? null} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
