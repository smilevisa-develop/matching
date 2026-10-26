import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import type { PlacementData } from "../[id]/edit/PlacementPanel";
import ProgressBoard, { type ProgressCard } from "../progress/ProgressBoard";

export const dynamic = "force-dynamic";

/**
 * 進捗ボードのお試しページ。本物と同じ画面を仮のデータで出す。動かしても保存しない。日付は今日を基準に作る。
 */
export default async function ProgressDemoPage() {
  const account = await requireCurrentAccount();
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
  /** 求人受付から n 段階目まで、間隔をあけて日付を入れる (skip の段階は空のまま) */
  const upTo = (n: number, start: number, skip: number[] = []): Partial<PlacementData> => {
    const fields = ["acceptedAt", "preInterviewAt", "companyInterviewAt", "offerAt", "offerAcceptedAt", "applicationPlannedAt", "applicationAt", "applicationResultAt"] as const;
    return Object.fromEntries(fields.slice(0, n + 1).map((f, i) => [f, skip.includes(i) ? null : ago(start - i * 6)]));
  };

  type Sample = [name: string, company: string, owner: string, kanban: string, placement: Partial<PlacementData>, kanbanDates?: Partial<Record<string, string>>, card?: boolean, joined?: boolean];
  const samples: Sample[] = [
    ["NGUYEN VAN AN", "株式会社サンプル食品", "トゥイ", "接続済み", upTo(0, 5)],
    ["LE THI HOA", "サンプル介護株式会社", "チンディ", "接続済み", {}],
    ["TRAN THI BICH", "株式会社サンプル清掃", "トゥイ", "推薦済み", upTo(0, 20), { preInterviewAt: ago(14) }],
    ["PHAM MINH DUC", "サンプル建設株式会社", "チンディ", "事前面談済み", upTo(1, 18)],
    ["HTET HTET", "株式会社サンプル食品", "トゥイ", "面接済み", upTo(2, 30)],
    ["NIMAL PERERA", "サンプル農園", "チンディ", "面接済み", upTo(0, 25), { preInterviewAt: ago(20), companyInterviewAt: ago(8) }],
    ["SITI NURHALIZA", "サンプル介護株式会社", "トゥイ", "内定済み", upTo(3, 40, [2])],
    ["AUNG KYAW MIN", "株式会社サンプル食品", "チンディ", "内定承諾", upTo(4, 50), {}, true],
    ["BUDI SANTOSO", "サンプル建設株式会社", "トゥイ", "内定承諾", { ...upTo(5, 60), applicationPlannedAt: ago(-4) }, {}, true],
    ["RINA OKTAVIA", "株式会社サンプル清掃", "チンディ", "内定承諾", { ...upTo(6, 70), applicationType: "変更", applicantName: "トゥイ" }, {}, true],
    ["THAN ZAW", "サンプル農園", "トゥイ", "内定承諾", { ...upTo(6, 75, [0, 1]), applicationType: "認定", applicantName: "チンディ" }, {}, true],
    [
      "MAI THI LAN",
      "サンプル介護株式会社",
      "チンディ",
      "入社待ち",
      { ...upTo(7, 90), applicationType: "変更", applicantName: "トゥイ", returnHomeFlag: "無", entryAt: ago(10), joinPlannedAt: ago(-10) },
      {},
      true,
    ],
    [
      "KYAW ZIN",
      "株式会社サンプル食品",
      "トゥイ",
      "入社済み",
      { ...upTo(7, 130), applicationType: "認定", applicantName: "チンディ", returnHomeFlag: "有", returnHomeAt: ago(60), entryPlannedAt: ago(30), entryAt: ago(28), joinPlannedAt: ago(20), joinAt: ago(20) },
      {},
      true,
      true,
    ],
  ];

  const cards: ProgressCard[] = samples.map(([name, companyName, ownerName, kanbanStage, placement, kanbanDates = {}, card = false, joined = false], i) => ({
    personId: 900000 + i,
    name,
    kanaName: null,
    companyName,
    ownerName,
    kanbanStage,
    placement: { ...empty, ...placement },
    kanbanDates,
    cardId: card ? 900000 + i : null,
    joined,
  }));

  return (
    <div className="space-y-4 p-8">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        これはお試しのページです。名前も日付も仮のデータで、カードを動かしたり日付を入れても保存されません (ページを開き直すと元に戻ります)。
        <Link href="/personnel/progress" className="ml-2 underline">
          本物の進捗ボードへ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">進捗ボード (お試し)</h1>
      <ProgressBoard demo initialCards={cards} me={account.name ?? ""} />
    </div>
  );
}
