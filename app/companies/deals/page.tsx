import { redirect } from "next/navigation";

// 案件ボードは廃止。入口は「企業」に一本化したため企業一覧へ集約する。
// (Deal テーブル自体は残す = スプシ同期の推薦先/状況の導出に必要)
export default function CompanyDealsPage() {
  redirect("/companies");
}
