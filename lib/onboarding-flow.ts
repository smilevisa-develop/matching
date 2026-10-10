/**
 * 内定後フローの定義 (内定者管理ボードの列・タスク・緊急度)。
 *
 * 元にしたもの:
 *   - 人材紹介連携ワークフロー.xlsx (STEP1〜12・担当・必要書類)
 *   - 書類準備手続き.docx (申請種別ごとの必要書類)
 *   - 在留カード受取の流れ.docx (オンライン申請 / 直接申請の受取手順)
 *   - 実際に起きたトラブル 12 件 (条件の後出し・確認不足で再申請・住居未定で辞退 など)
 *
 * 川村さんの指示:
 *   申請予定日 = 内定受領から 10 日後 / 就業開始予定日 = 内定受領から 2 か月後
 */

import { MASTER_TASKS, TASK_PHASES, type MasterTask } from "./onboarding-task-master";

export const OFFER_TO_APPLICATION_DAYS = 10;
export const OFFER_TO_JOIN_DAYS = 60;

/**
 * ボードの列 (ステージ)。
 * phases は「この工程に属するタスク」を表し、スプレッドシート
 * 「内定後タスク管理表」の工程名と一対一で対応している。
 * hold (保留) は問題が起きた人を一時的に置く場所。
 */
export const ONBOARDING_STAGES = [
  {
    id: "offer",
    label: "内定直後",
    hint: "条件・費用負担の確定、企業への共有開始",
    targetDays: 7,
    phases: ["1. 内定直後（条件確定）", "2. 企業への共有・報告"],
  },
  {
    id: "documents",
    label: "書類収集",
    hint: "必要書類の案内と回収 (共通 + 申請種別別)",
    targetDays: 10,
    phases: ["3. 書類収集（共通）", "4. 書類収集（種別別）"],
  },
  {
    id: "prepare",
    label: "申請準備・署名",
    hint: "SmileVisa登録、契約書類の署名、社内報告",
    targetDays: 7,
    phases: ["5. 申請準備・署名"],
  },
  {
    id: "applying",
    label: "申請中",
    hint: "入管へ提出。申請番号を記録して共有",
    targetDays: 45,
    phases: ["6. 申請"],
  },
  {
    id: "result",
    label: "結果受領・在留カード",
    hint: "結果通知、在留カード受取 (14日以内)",
    targetDays: 14,
    phases: ["7. 結果受領・在留カード"],
  },
  {
    id: "arrival",
    label: "渡航・住居",
    hint: "入国日/航空券の確認、送迎、住居・生活の立ち上げ",
    targetDays: 20,
    phases: ["8. 渡航・入国", "9. 住居・生活"],
  },
  {
    id: "joined",
    label: "入社前後・請求",
    hint: "入社前確認、当日連絡、1週間後フォロー、請求",
    targetDays: 30,
    phases: ["10. 入社前後"],
  },
  {
    id: "hold",
    label: "⚠ 保留・問題対応中",
    hint: "問題が解決するまで一時的にここへ置く",
    targetDays: 7,
    phases: [],
  },
] as const;

export type OnboardingStageId = (typeof ONBOARDING_STAGES)[number]["id"];

export const HOLD_STAGE: OnboardingStageId = "hold";

/** 旧ステージ (入社進捗ページ) からの読み替え */
const LEGACY_STAGE_MAP: Record<string, OnboardingStageId> = {
  offered: "offer",
  accepted: "documents",
  applying: "applying",
  approved: "result",
  entered: "arrival",
  joined: "joined",
  // v1 のステージ名
  pledge: "offer",
  joining: "arrival",
};

/** 保存値 / 日付から現在のステージを決める */
export function resolveStage(input: {
  stage?: string | null;
  offerAcceptedAt?: Date | null;
  applicationAt?: Date | null;
  applicationResultAt?: Date | null;
  entryAt?: Date | null;
  joinAt?: Date | null;
}): OnboardingStageId {
  const saved = input.stage ?? "";
  if (ONBOARDING_STAGES.some((s) => s.id === saved)) return saved as OnboardingStageId;
  if (LEGACY_STAGE_MAP[saved]) return LEGACY_STAGE_MAP[saved];
  if (input.joinAt) return "joined";
  if (input.entryAt) return "arrival";
  if (input.applicationResultAt) return "result";
  if (input.applicationAt) return "applying";
  if (input.offerAcceptedAt) return "documents";
  return "offer";
}

/** 申請種別。必要書類が変わる (書類準備手続き.docx) */
export const APPLICATION_TYPES = ["認定", "変更", "更新", "特定活動"] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

/** 工程名 → ステージ */
export function stageOfPhase(phase: string): OnboardingStageId {
  const hit = ONBOARDING_STAGES.find((s) => (s.phases as readonly string[]).includes(phase));
  return hit?.id ?? "offer";
}

/** そのステージに属するタスクだけ取り出す */
export function tasksInStage<T extends { category: string }>(tasks: T[], stage: OnboardingStageId) {
  return tasks.filter((t) => stageOfPhase(t.category) === stage);
}

/**
 * 申請種別に応じたタスク一覧を、内定受領日を起点に期限付きで組み立てる。
 * 中身はスプレッドシート「内定後タスク管理表」と同じ (原本: lib/onboarding-task-master.ts)。
 * category に工程名を入れておくことで、ステージごとのチェックリストとして表示できる。
 */
export function buildFlowTasks(applicationType: string | null, baseDate: Date | null) {
  const type = (APPLICATION_TYPES as readonly string[]).includes(applicationType ?? "")
    ? (applicationType as ApplicationType)
    : null;

  const matches = (target: MasterTask["target"]): boolean => {
    if (target === "全員") return true;
    if (!type) return false;
    if (target === "認定（海外）") return type === "認定";
    if (target === "変更（国内転職）") return type === "変更";
    if (target === "更新") return type === "更新";
    if (target === "特定活動") return type === "特定活動";
    if (target === "国内（変更・更新・特定活動）") {
      return type === "変更" || type === "更新" || type === "特定活動";
    }
    return false;
  };

  return MASTER_TASKS.filter((t) => matches(t.target))
    .sort((a, b) => {
      const pa = TASK_PHASES.indexOf(a.phase);
      const pb = TASK_PHASES.indexOf(b.phase);
      return pa - pb || a.dueDays - b.dueDays;
    })
    .map((t, index) => ({
      category: t.phase,
      title: t.title,
      sortOrder: index,
      dueAt: baseDate ? new Date(baseDate.getTime() + t.dueDays * 86_400_000) : null,
      // 手順・エビデンス・過去の問題はメモとして残す (詳細パネルで見る)
      note: [
        t.howto ? `手順: ${t.howto}` : "",
        t.evidence ? `エビデンス: ${t.evidence}` : "",
        t.problem ? `※過去の問題: ${t.problem}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }));
}

/** 緊急度。赤 = 今日中に手を打つ、黄 = 近い、通常 = 余裕あり */
export type Urgency = "red" | "amber" | "normal";

export function calcUrgency(input: {
  stage: OnboardingStageId;
  openIssues: number;
  overdueTasks: number;
  nextActionDueAt: Date | null;
  applicationPlannedAt: Date | null;
  applicationAt: Date | null;
  joinPlannedAt: Date | null;
  joinAt: Date | null;
  visaExpiryDate: string | null;
  stageChangedAt: Date | null;
}): { level: Urgency; reasons: string[] } {
  const reasons: string[] = [];
  const now = Date.now();
  const day = 86_400_000;

  if (input.stage === HOLD_STAGE) reasons.push("保留中");
  if (input.openIssues > 0) reasons.push(`未解決の問題 ${input.openIssues} 件`);
  if (input.overdueTasks > 0) reasons.push(`期限切れ ${input.overdueTasks} 件`);
  if (input.nextActionDueAt && input.nextActionDueAt.getTime() < now) reasons.push("次アクション期限切れ");
  if (!input.applicationAt && input.applicationPlannedAt && input.applicationPlannedAt.getTime() < now) {
    reasons.push("申請予定日を過ぎている");
  }
  if (!input.joinAt && input.joinPlannedAt && input.joinPlannedAt.getTime() < now) {
    reasons.push("入社予定日を過ぎている");
  }
  if (input.visaExpiryDate) {
    const exp = new Date(input.visaExpiryDate).getTime();
    if (!Number.isNaN(exp)) {
      const left = Math.ceil((exp - now) / day);
      if (left <= 0) reasons.push("在留期限切れ");
      else if (left <= 30) reasons.push(`在留期限まで ${left} 日`);
    }
  }
  if (reasons.length > 0) return { level: "red", reasons };

  const soon: string[] = [];
  if (input.nextActionDueAt && input.nextActionDueAt.getTime() - now < 3 * day) soon.push("次アクションの期限が近い");
  if (!input.applicationAt && input.applicationPlannedAt && input.applicationPlannedAt.getTime() - now < 3 * day) {
    soon.push("申請予定日が近い");
  }
  const stageDays = input.stageChangedAt
    ? Math.floor((now - input.stageChangedAt.getTime()) / day)
    : null;
  const target = ONBOARDING_STAGES.find((s) => s.id === input.stage)?.targetDays ?? 14;
  if (stageDays !== null && stageDays > target) soon.push(`この工程で ${stageDays} 日滞留`);
  if (soon.length > 0) return { level: "amber", reasons: soon };

  return { level: "normal", reasons: [] };
}
