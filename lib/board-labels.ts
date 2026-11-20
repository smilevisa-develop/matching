/**
 * 案件ボードの表示用の定数 (画面のどこからでも読める。DB や cookie は使わない)。
 */

/** 推薦の状況 (パートナーにも見える) */
export const BOARD_REC_STATUSES = ["受付", "書類確認中", "企業に推薦", "面接", "内定", "見送り", "取り下げ"] as const;

/** 枠を数えないもの (見送り・取り下げは枠を空ける) */
export const BOARD_REC_INACTIVE = ["見送り", "取り下げ"];

/** 状況の英語 (パートナー画面に併記) */
export const BOARD_REC_STATUS_EN: Record<string, string> = {
  受付: "Received",
  書類確認中: "Screening",
  企業に推薦: "Sent to employer",
  面接: "Interview",
  内定: "Offer",
  見送り: "Not selected",
  取り下げ: "Withdrawn",
};

/** ボードの公開状態 */
export const BOARD_STATUS_LABEL: Record<string, string> = {
  hidden: "出さない",
  open: "募集中",
  closed: "締切",
};
