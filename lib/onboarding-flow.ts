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
    label: "内定",
    hint: "条件・費用負担の確定、企業への共有開始",
    targetDays: 7,
    phases: ["1. 内定直後（条件確定）", "2. 企業への共有・報告"],
  },
  {
    id: "documents",
    label: "書類集め",
    hint: "必要書類の案内と回収 (共通 + 申請種別別)",
    targetDays: 10,
    phases: ["3. 書類収集（共通）", "4. 書類収集（種別別）"],
  },
  {
    id: "prepare",
    label: "申請準備",
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
    id: "card_processing",
    label: "在留カード発行手続き中",
    hint: "結果通知、在留カード受取 (14日以内)",
    targetDays: 14,
    phases: ["7. 結果受領・在留カード"],
  },
  {
    id: "card_issued",
    label: "発行完了",
    hint: "在留カードを受け取った",
    targetDays: 7,
    phases: [],
  },
  {
    id: "card_cancelled",
    label: "発行キャンセル",
    hint: "不許可・取り下げ・辞退などで発行に至らなかった",
    targetDays: 0,
    phases: [],
  },
  {
    id: "support",
    label: "サポート",
    hint: "入国・住居・銀行・保険など、必要なサポートを選んで進める",
    targetDays: 20,
    phases: ["8. 渡航・入国", "9. 住居・生活"],
  },
  {
    id: "joined",
    label: "入社・請求",
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
  approved: "card_processing",
  entered: "support",
  joined: "joined",
  // v1 のステージ名
  pledge: "offer",
  joining: "support",
  // v2 (2026/10 前半) のステージ名
  result: "card_processing",
  arrival: "support",
};

/** 「次へ進む」の順番 (発行キャンセル・保留には次が無い) */
export const NEXT_STAGE: Partial<Record<OnboardingStageId, OnboardingStageId>> = {
  offer: "documents",
  documents: "prepare",
  prepare: "applying",
  applying: "card_processing",
  card_processing: "card_issued",
  card_issued: "support",
  support: "joined",
};

/** サポート工程のタスクが属する工程名 */
export const SUPPORT_PHASES: readonly string[] = ["8. 渡航・入国", "9. 住居・生活"];

/**
 * サポート工程に入れたときに選ぶ「必要なサポート」。選んだものだけタスクになる
 * (引っ越しが不要な人に引っ越しのタスクを出さないため)。
 */
export const SUPPORT_OPTIONS: { id: string; label: string; tasks: { category: string; title: string }[] }[] = [
  {
    id: "flight",
    label: "航空券・ビザ（海外から呼ぶ）",
    tasks: [
      { category: "8. 渡航・入国", title: "COE送付・ビザ申請をサポートする" },
      { category: "8. 渡航・入国", title: "航空券の予約内容をエビデンス付きで確認する（Eチケット）" },
      { category: "8. 渡航・入国", title: "確定した入国日とEチケットを企業へ送付する" },
      { category: "8. 渡航・入国", title: "入国日と在留期限の整合を確認する" },
    ],
  },
  {
    id: "pickup",
    label: "空港送迎",
    tasks: [{ category: "8. 渡航・入国", title: "空港送迎の担当・集合場所・時間を企業と合意する" }],
  },
  {
    id: "arrival_prep",
    label: "入国前の準備（印鑑・SIM・サイズ）",
    tasks: [
      { category: "8. 渡航・入国", title: "印鑑・SIMカードの準備を案内する" },
      { category: "8. 渡航・入国", title: "身体情報（身長・服・ズボン・靴のサイズ）を確認し企業へ提供する" },
    ],
  },
  {
    id: "housing",
    label: "住居・引っ越し",
    tasks: [
      { category: "9. 住居・生活", title: "住居の確保を完了する（入居日・費用・鍵の受け渡し）" },
      { category: "9. 住居・生活", title: "引っ越しの段取り（日程・運搬・費用負担）を決める" },
      { category: "9. 住居・生活", title: "寮退去日の確認と住所変更手続きを案内する" },
    ],
  },
  {
    id: "resident",
    label: "住民登録（転入届）",
    tasks: [{ category: "9. 住居・生活", title: "住民登録（転入届・マイナンバー）を案内・同行する" }],
  },
  {
    id: "bank",
    label: "銀行口座",
    tasks: [{ category: "9. 住居・生活", title: "銀行口座の開設を案内・同行する" }],
  },
  {
    id: "insurance",
    label: "保険・年金",
    tasks: [{ category: "9. 住居・生活", title: "健康保険・年金の加入手続きを確認する" }],
  },
  {
    id: "mobile",
    label: "携帯契約",
    tasks: [{ category: "9. 住居・生活", title: "携帯電話の契約を案内する" }],
  },
  {
    id: "orientation",
    label: "生活オリエンテーション",
    tasks: [{ category: "9. 住居・生活", title: "生活オリエンテーションを実施する（ゴミ出し・交通・緊急連絡先）" }],
  },
];

/** 選んだサポート id → タスク (順番は SUPPORT_OPTIONS の並び) */
export function buildSupportTasks(selected: readonly string[]) {
  const set = new Set(selected);
  return SUPPORT_OPTIONS.filter((o) => set.has(o.id)).flatMap((o) => o.tasks);
}

/** supports (Json) を安全に読む */
export function readSupports(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(SUPPORT_OPTIONS.map((o) => o.id));
  return value.filter((v): v is string => typeof v === "string" && ids.has(v));
}

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
  if (input.entryAt) return "support";
  if (input.applicationResultAt) return "card_processing";
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
