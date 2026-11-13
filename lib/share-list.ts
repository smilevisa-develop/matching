/**
 * 企業向けの推薦リスト (/list/{Deal.shareToken}) で、企業が選べる進捗。
 * スタッフが推薦リストのスプシで使っていた選択肢 (lib/recommendation-columns の RECOMMENDATION_PROGRESS_OPTIONS) に合わせ、
 * アプリのステージにそのまま入るものだけにした (「辞退」= 応募辞退)。人材紹介会社は入社待ち・入社済みも選べる
 */
import { isAgencyKind } from "@/lib/deal-stages";

export function companyStageOptions(companyKind: string | null | undefined): string[] {
  const base = ["事前面談済み", "面接済み", "内定済み", "不合格", "応募辞退", "内定辞退"];
  return isAgencyKind(companyKind) ? [...base.slice(0, 3), "入社待ち", "入社済み", ...base.slice(3)] : base;
}

export const SHARE_TEXT_MAX = 500;
