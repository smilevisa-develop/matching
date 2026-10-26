import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import type { PlacementData } from "../[id]/edit/PlacementPanel";
import ProgressDemoClient, { type DemoPerson } from "./ProgressDemoClient";

export const dynamic = "force-dynamic";

/**
 * 候補者詳細「請求」タブの「進捗 / 日程」(カンバン形式) のお試しページ。
 * 本物と同じ部品を仮のデータで出す。押しても保存しない。日付は今日を基準に作る。
 */
export default async function ProgressDemoPage() {
  await requireCurrentAccount();
  const today = new Date().getTime() + 9 * 3600_000;
  /** 今日から n 日前の日付 (YYYY-MM-DD) */
  const ago = (n: number) => new Date(today - n * 86_400_000).toISOString().slice(0, 10);

  const empty: PlacementData = {
    acceptedAt: null,
    preInterviewAt: null,
    companyInterviewAt: null,
    offerAt: null,
    offerAcceptedAt: null,
    applicationPlannedAt: null,
    applicationAt: null,
    applicationResultAt: null,
    applicationType: null,
    applicantName: null,
    returnHomeFlag: null,
    returnHomeAt: null,
    entryPlannedAt: null,
    entryAt: null,
    joinPlannedAt: null,
    joinAt: null,
    sixMonthStatus: null,
    consultation: null,
    currentAction: null,
  };

  const people: DemoPerson[] = [
    {
      id: 1,
      name: "NGUYEN VAN AN",
      note: "事前面談まで済み。次は企業面談",
      placement: { ...empty, acceptedAt: ago(20), preInterviewAt: ago(12) },
      kanbanDates: {},
    },
    {
      id: 2,
      name: "TRAN THI BICH",
      note: "カンバンでは企業面談まで進んでいるが、ここは未入力 (カンバンの日付が候補に出る)",
      placement: { ...empty, acceptedAt: ago(25) },
      kanbanDates: { preInterviewAt: ago(18), companyInterviewAt: ago(9) },
    },
    {
      id: 3,
      name: "SITI NURHALIZA",
      note: "内定承諾まで進んだが、企業面談の日付が抜けている (黄色)",
      placement: { ...empty, acceptedAt: ago(45), preInterviewAt: ago(40), offerAt: ago(28), offerAcceptedAt: ago(25) },
      kanbanDates: {},
    },
    {
      id: 4,
      name: "AUNG KYAW MIN",
      note: "申請予定まで。次は申請 (申請種別・申請者も入れる)",
      placement: {
        ...empty,
        acceptedAt: ago(60),
        preInterviewAt: ago(55),
        companyInterviewAt: ago(48),
        offerAt: ago(40),
        offerAcceptedAt: ago(38),
        applicationPlannedAt: ago(-3),
        joinPlannedAt: ago(-50),
      },
      kanbanDates: {},
    },
    {
      id: 5,
      name: "BUDI SANTOSO",
      note: "申請結果まで全部済み。一時帰国より後は内定者管理で入っている",
      placement: {
        ...empty,
        acceptedAt: ago(120),
        preInterviewAt: ago(115),
        companyInterviewAt: ago(108),
        offerAt: ago(100),
        offerAcceptedAt: ago(97),
        applicationPlannedAt: ago(85),
        applicationAt: ago(84),
        applicationResultAt: ago(40),
        applicationType: "変更",
        applicantName: "トゥイ",
        returnHomeFlag: "有",
        returnHomeAt: ago(35),
        entryPlannedAt: ago(15),
        entryAt: ago(14),
        joinPlannedAt: ago(7),
        joinAt: ago(7),
      },
      kanbanDates: {},
    },
  ];

  return (
    <div className="space-y-4 p-8">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        これはお試しのページです。名前も日付も仮のデータで、列を押して日付を入れても保存されません (ページを開き直すと元に戻ります)。
        <Link href="/personnel" className="ml-2 underline">
          候補者一覧へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">進捗 / 日程 (お試し)</h1>
      <ProgressDemoClient people={people} />
    </div>
  );
}
