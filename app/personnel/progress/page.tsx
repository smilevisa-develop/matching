import Link from "next/link";
import { requireCurrentAccount } from "@/lib/auth";
import { loadProgressCards } from "@/lib/progress-board";
import ProgressBoard from "./ProgressBoard";

export const dynamic = "force-dynamic";

/**
 * 進捗ボード。候補者ごとの「求人受付 → … → 申請結果」の日程を、内定者管理と同じ形で全員分並べる。
 * 内定までは企業の担当者 (トゥイ・チンディ)、一時帰国より後は内定者管理 (グェット) で入れる。
 */
export default async function ProgressBoardPage() {
  const account = await requireCurrentAccount();
  const cards = await loadProgressCards();
  return (
    <div className="space-y-4 p-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">進捗ボード</h1>
        <Link href="/personnel/progress-demo" className="text-sm text-[var(--color-primary)] underline">
          仮のデータで試す
        </Link>
      </div>
      <ProgressBoard initialCards={cards} me={account.name ?? ""} />
    </div>
  );
}
