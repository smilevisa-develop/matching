/**
 * 内定後の標準タスク (内定後管理ボードのチェックリスト)。
 *
 * 実際に起きたトラブル 12 件から逆算して作っている:
 *   - 条件・費用負担が後出しになる (誠: 渡航費/給与/手当, 謝花: 航空券代, 戎: 退職証明書)
 *   - 書類・情報の確認不足で申請をやり直す (イワタ 3 回, 安達 自社支援の誤り)
 *   - 書類収集に時間がかかり申請が遅れる (山王, 電気工事: 前の組合に連絡つかず, 介護: 本人が履歴不明)
 *   - 住居が決まらず内定辞退 (イワタ Vicky)
 *   - 在留期限・入国日の管理漏れ (サンクリーン: 期限切れ/転出届, MN: 入国遅れ)
 *   - 入社したのに連絡が来ない (シナジー)
 *
 * dueOffsetDays は「内定承諾日から何日後が期限か」。承諾日が未記録なら期限なしで作る。
 */

export const ONBOARDING_TASK_CATEGORIES = [
  "条件確認",
  "書類",
  "申請",
  "渡航・住居",
  "入社後",
] as const;

export type OnboardingTaskCategory = (typeof ONBOARDING_TASK_CATEGORIES)[number];

export type OnboardingTaskTemplate = {
  category: OnboardingTaskCategory;
  title: string;
  dueOffsetDays: number;
};

export const ONBOARDING_TASK_TEMPLATE: OnboardingTaskTemplate[] = [
  // ── 条件確認 (内定直後に確定させる。後出しを防ぐ) ──
  { category: "条件確認", title: "給与・手当の最終条件を企業と文書で確定", dueOffsetDays: 3 },
  { category: "条件確認", title: "費用負担の確定（渡航費・航空券・住居初期費用・支援費）", dueOffsetDays: 3 },
  { category: "条件確認", title: "事前確認資料を母国語で送付し、本人の確認を取る", dueOffsetDays: 5 },
  { category: "条件確認", title: "支援機関（自社支援 / 登録支援機関）の区分を確認", dueOffsetDays: 5 },

  // ── 書類 (申請前に揃える。ここの漏れが申請やり直しになる) ──
  { category: "書類", title: "必要書類リストを本人へ送付（母国語）", dueOffsetDays: 5 },
  { category: "書類", title: "本人の在留歴・職歴を確認（前職の組合・監理団体の連絡先を含む）", dueOffsetDays: 7 },
  { category: "書類", title: "退職証明書の要否を確認し、必要なら取得依頼", dueOffsetDays: 7 },
  { category: "書類", title: "健康診断の受診と結果の受領", dueOffsetDays: 14 },
  { category: "書類", title: "課税・納税証明書の取得", dueOffsetDays: 14 },

  // ── 申請 ──
  { category: "申請", title: "申請書類一式を2人でダブルチェック", dueOffsetDays: 21 },
  { category: "申請", title: "入管へ申請を提出", dueOffsetDays: 24 },
  { category: "申請", title: "受付票を受領し、企業へ共有", dueOffsetDays: 30 },
  { category: "申請", title: "在留期限・申請結果の見込みを本人と企業に連絡", dueOffsetDays: 35 },

  // ── 渡航・住居 ──
  { category: "渡航・住居", title: "住居を確保（場所・費用・入居可能日を確定）", dueOffsetDays: 30 },
  { category: "渡航・住居", title: "航空券の手配（手配者と費用負担を明確にする）", dueOffsetDays: 45 },
  { category: "渡航・住居", title: "入国日を確定し、企業へ正式に連絡", dueOffsetDays: 50 },
  { category: "渡航・住居", title: "出国前の手続き確認（転出届・再入国の可否）", dueOffsetDays: 50 },

  // ── 入社後 ──
  { category: "入社後", title: "入社日の確定と企業への共有", dueOffsetDays: 55 },
  { category: "入社後", title: "住民登録・口座開設・携帯契約の案内", dueOffsetDays: 60 },
  { category: "入社後", title: "入社1週間後のフォロー連絡（本人・企業の両方）", dueOffsetDays: 67 },
];

/** 標準タスクを、内定承諾日を起点に期限付きで組み立てる */
export function buildOnboardingTasks(baseDate: Date | null) {
  return ONBOARDING_TASK_TEMPLATE.map((t, index) => ({
    category: t.category,
    title: t.title,
    sortOrder: index,
    dueAt: baseDate ? new Date(baseDate.getTime() + t.dueOffsetDays * 86_400_000) : null,
  }));
}
