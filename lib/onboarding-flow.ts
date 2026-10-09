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

export const OFFER_TO_APPLICATION_DAYS = 10;
export const OFFER_TO_JOIN_DAYS = 60;

/** ボードの列。hold (保留) は問題が起きた人を一時的に置く場所 */
export const ONBOARDING_STAGES = [
  {
    id: "pledge",
    label: "誓約書・情報共有",
    hint: "誓約書の署名案内、内定フォロー担当への引き継ぎ",
    targetDays: 3,
  },
  { id: "documents", label: "書類収集", hint: "必要書類の案内と回収", targetDays: 10 },
  { id: "prepare", label: "申請準備・署名", hint: "契約書類の署名、SmileVisa登録、社内報告", targetDays: 15 },
  { id: "applying", label: "申請中", hint: "入管へ提出済み。申請番号を記録", targetDays: 45 },
  { id: "result", label: "結果受領・在留カード", hint: "結果通知、在留カード受取 (14日以内)", targetDays: 14 },
  { id: "joining", label: "入社準備", hint: "入国日/航空券・住所変更・寮・入社日確定", targetDays: 20 },
  { id: "joined", label: "入社済み・請求", hint: "入社報告とフォロー、請求対応", targetDays: 30 },
  { id: "hold", label: "⚠ 保留・問題対応中", hint: "問題が解決するまで一時的にここへ置く", targetDays: 7 },
] as const;

export type OnboardingStageId = (typeof ONBOARDING_STAGES)[number]["id"];

export const HOLD_STAGE: OnboardingStageId = "hold";

/** 旧ステージ (入社進捗ページ) からの読み替え */
const LEGACY_STAGE_MAP: Record<string, OnboardingStageId> = {
  offered: "pledge",
  accepted: "documents",
  applying: "applying",
  approved: "result",
  entered: "joining",
  joined: "joined",
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
  if (input.entryAt) return "joining";
  if (input.applicationResultAt) return "result";
  if (input.applicationAt) return "applying";
  if (input.offerAcceptedAt) return "documents";
  return "pledge";
}

/** 申請種別。必要書類が変わる (書類準備手続き.docx) */
export const APPLICATION_TYPES = ["認定", "変更", "更新", "特定活動"] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export type FlowTask = {
  category: string;
  title: string;
  /** 内定受領からの日数 */
  dueOffsetDays: number;
  /** この申請種別のときだけ出すタスク (未指定なら全員) */
  onlyFor?: ApplicationType[];
};

/** 全員共通のタスク (ワークフロー STEP1〜12) */
const COMMON_TASKS: FlowTask[] = [
  // STEP1-2
  { category: "1. 誓約書・情報共有", title: "誓約書への署名を案内する", dueOffsetDays: 2 },
  { category: "1. 誓約書・情報共有", title: "グループを作成し、応募者情報と書類を内定フォロー担当へ共有", dueOffsetDays: 2 },
  { category: "1. 誓約書・情報共有", title: "給与・手当の最終条件を企業と文書で確定", dueOffsetDays: 3 },
  { category: "1. 誓約書・情報共有", title: "費用負担を確定（渡航費・航空券・住居初期費用・支援費）", dueOffsetDays: 3 },

  // STEP3 共通書類
  { category: "2. 書類収集（共通）", title: "QR LINE・電話番号・メールの確認", dueOffsetDays: 5 },
  { category: "2. 書類収集（共通）", title: "顔写真（3か月以内・白背景・未提出のもの）", dueOffsetDays: 7 },
  { category: "2. 書類収集（共通）", title: "技能・専門資格の証明書（専門級/随時3級/評価証明書/特定技能1号）", dueOffsetDays: 7 },
  { category: "2. 書類収集（共通）", title: "日本語合格証明書（最上位のもの）", dueOffsetDays: 7 },
  { category: "2. 書類収集（共通）", title: "健康診断書", dueOffsetDays: 10 },
  { category: "2. 書類収集（共通）", title: "受診者の申告書", dueOffsetDays: 10 },
  { category: "2. 書類収集（共通）", title: "パスポート（査証・出入国スタンプの全ページ）", dueOffsetDays: 7 },

  // STEP4
  { category: "3. 追加情報の確認", title: "入社予定日・退職日・寮退去日・帰国予定日を確認", dueOffsetDays: 7 },
  { category: "3. 追加情報の確認", title: "在日家族の有無を確認（いれば在留カードと勤務先/学校名）", dueOffsetDays: 7 },
  { category: "3. 追加情報の確認", title: "過去の出入国歴・認定申請歴・退去強制歴を確認", dueOffsetDays: 7 },

  // STEP5-6
  { category: "4. 登録・報告", title: "全書類を Smile Visa へアップロード", dueOffsetDays: 9 },
  { category: "4. 登録・報告", title: "内定管理シートを更新し、川村さん／企業へ報告", dueOffsetDays: 9 },

  // STEP7
  { category: "5. 署名", title: "雇用契約書・労働条件通知書・支援計画を受領", dueOffsetDays: 9 },
  { category: "5. 署名", title: "応募者へ送付して署名を依頼", dueOffsetDays: 10 },
  { category: "5. 署名", title: "署名済み書類を Smile Visa へアップロードし、川村さん／企業へメール報告", dueOffsetDays: 10 },

  // STEP8
  { category: "6. 申請", title: "申請書類一式を2人でダブルチェック", dueOffsetDays: OFFER_TO_APPLICATION_DAYS - 1 },
  { category: "6. 申請", title: "入管へ申請を提出", dueOffsetDays: OFFER_TO_APPLICATION_DAYS },
  { category: "6. 申請", title: "申請提出日・申請番号を記録し、本人と川村さん／企業へ通知", dueOffsetDays: OFFER_TO_APPLICATION_DAYS + 2 },

  // STEP10-12
  { category: "9. 入社・請求", title: "入社日を確定し、川村さん／企業へメール報告", dueOffsetDays: OFFER_TO_JOIN_DAYS - 7 },
  { category: "9. 入社・請求", title: "入社日を人材チームへ報告", dueOffsetDays: OFFER_TO_JOIN_DAYS },
  { category: "9. 入社・請求", title: "入社1週間後のフォロー連絡（本人・企業の両方）", dueOffsetDays: OFFER_TO_JOIN_DAYS + 7 },
  { category: "9. 入社・請求", title: "請求対応（人材チーム採用）", dueOffsetDays: OFFER_TO_JOIN_DAYS + 7 },
];

/** 申請種別ごとの追加書類 (書類準備手続き.docx) */
const TYPE_TASKS: FlowTask[] = [
  // 認定 (海外から)
  { category: "2. 書類収集（認定）", title: "本国の居住地（アルファベット70字以内）を確認", dueOffsetDays: 7, onlyFor: ["認定"] },
  { category: "2. 書類収集（認定）", title: "推薦状の手配（ベトナム・カンボジア等。送り出し機関が担当・費用発生）", dueOffsetDays: 10, onlyFor: ["認定"] },
  { category: "7. 結果後（海外）", title: "COE送付・ビザ申請サポート", dueOffsetDays: 50, onlyFor: ["認定"] },
  { category: "7. 結果後（海外）", title: "入国日・航空券を確定（Eチケットを企業へ送付。不確かな情報は送らない）", dueOffsetDays: 52, onlyFor: ["認定"] },
  { category: "7. 結果後（海外）", title: "印鑑・SIMカードの準備を案内", dueOffsetDays: 54, onlyFor: ["認定"] },
  { category: "7. 結果後（海外）", title: "身体情報（身長・服・ズボン・靴のサイズ）を確認して企業へ提供", dueOffsetDays: 54, onlyFor: ["認定"] },

  // 変更 (国内転職)
  { category: "2. 書類収集（変更）", title: "在留カード両面", dueOffsetDays: 7, onlyFor: ["変更"] },
  { category: "2. 書類収集（変更）", title: "源泉徴収票（勤務した全社分）", dueOffsetDays: 10, onlyFor: ["変更", "更新"] },
  { category: "2. 書類収集（変更）", title: "課税証明書（1/1時点の市役所で取得）", dueOffsetDays: 10, onlyFor: ["変更", "更新"] },
  { category: "2. 書類収集（変更）", title: "納税証明書（1/1時点の市役所で取得）", dueOffsetDays: 10, onlyFor: ["変更", "更新"] },
  { category: "2. 書類収集（変更）", title: "住民票（個人番号あり）", dueOffsetDays: 10, onlyFor: ["変更"] },
  { category: "2. 書類収集（変更）", title: "退職届・退職証明書", dueOffsetDays: 10, onlyFor: ["変更"] },
  { category: "2. 書類収集（変更）", title: "年金・保険関連書類（主に元留学生）", dueOffsetDays: 10, onlyFor: ["変更"] },
  { category: "2. 書類収集（変更）", title: "実習生からの移行は、在日ベトナム領事館での推薦状申請（管理元が担当）", dueOffsetDays: 12, onlyFor: ["変更"] },

  // 更新
  { category: "2. 書類収集（更新）", title: "在留カード両面・パスポート", dueOffsetDays: 7, onlyFor: ["更新"] },
  { category: "2. 書類収集（更新）", title: "在日家族の情報を再確認（勤務先・在留カード・婚姻状況）", dueOffsetDays: 7, onlyFor: ["更新"] },

  // 特定活動
  { category: "2. 書類収集（特定活動）", title: "在留カード・パスポート・申請書", dueOffsetDays: 7, onlyFor: ["特定活動"] },
  { category: "2. 書類収集（特定活動）", title: "契約書・条件書・賃金支払・説明書（会社準備）", dueOffsetDays: 9, onlyFor: ["特定活動"] },
  { category: "2. 書類収集（特定活動）", title: "会社が登録中の手続きのスクショ/メール（説明書に記載のもの）", dueOffsetDays: 9, onlyFor: ["特定活動"] },
  { category: "2. 書類収集（特定活動）", title: "理由書（受取場所・帰国日・早期入社の希望がある場合）", dueOffsetDays: 9, onlyFor: ["特定活動"] },

  // 在留カード受取 (国内＝変更/更新/特定活動)
  { category: "8. 在留カード受取", title: "受取方法を決める（オンライン＝郵送 / 直接＝入管窓口）※佐々木さんに早めに相談", dueOffsetDays: 40, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "手数料納付書を準備し、本人へPDF送付（申請番号・種別・氏名の記入を案内）", dueOffsetDays: 42, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "収入印紙の購入を案内（オンライン=5,000円+500円 / 直接=6,000円）", dueOffsetDays: 42, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "レターパック（青・430円）でCROSLAN大阪事務所へ送付を案内し、内容を確認", dueOffsetDays: 44, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "受領したらSlack「在留資格の処理連絡」で佐々木さんへ報告（依頼内容・対象者・住所・期日・郵送方法）", dueOffsetDays: 45, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "新カード受領後、あて名をWord/PDFで作成し本人または企業へ返送（手書き禁止）", dueOffsetDays: 55, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "返送管理シートに記入（対象者・依頼日・対応者）", dueOffsetDays: 55, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "8. 在留カード受取", title: "結果通知から14日以内（郵送）/ ハガキ記載期限内（直接）に受取を完了", dueOffsetDays: 56, onlyFor: ["変更", "更新", "特定活動"] },

  // 国内転職の生活まわり
  { category: "7. 結果後（国内）", title: "寮退去日の確認と住所変更手続き（窓口または郵送）", dueOffsetDays: 50, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "7. 結果後（国内）", title: "住居の確保（会社寮 or 本人手配）と引越しサポートの要否確認", dueOffsetDays: 50, onlyFor: ["変更", "更新", "特定活動"] },
  { category: "7. 結果後（国内）", title: "一時帰国する場合は必ず取次申請にする（出国前に確認）", dueOffsetDays: 50, onlyFor: ["変更", "更新", "特定活動"] },
];

/** 申請種別に応じたタスク一覧を、内定受領日を起点に期限付きで組み立てる */
export function buildFlowTasks(applicationType: string | null, baseDate: Date | null) {
  const type = (APPLICATION_TYPES as readonly string[]).includes(applicationType ?? "")
    ? (applicationType as ApplicationType)
    : null;
  const all = [...COMMON_TASKS, ...TYPE_TASKS].filter(
    (t) => !t.onlyFor || (type ? t.onlyFor.includes(type) : false),
  );
  return all
    .sort((a, b) => a.category.localeCompare(b.category, "ja") || a.dueOffsetDays - b.dueOffsetDays)
    .map((t, index) => ({
      category: t.category,
      title: t.title,
      sortOrder: index,
      dueAt: baseDate ? new Date(baseDate.getTime() + t.dueOffsetDays * 86_400_000) : null,
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
