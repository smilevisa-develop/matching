import { redirect } from "next/navigation";

/**
 * 旧「入社進捗」ページ。
 * 内定管理と入社管理を分ける必要がないため、内定者管理ボード (/onboarding) に統合した。
 * 既存のブックマーク・リンクから来た人のためにリダイレクトだけ残している。
 */
export default function PlacementsPage() {
  redirect("/onboarding");
}
