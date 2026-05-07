import { matchLabel, looseMatchLabel } from "./labelDictionary";
import type { SectionChunk, SectionKey } from "./types";

/**
 * 1 ページ分の rawText をセクションに分割する。
 *
 * シンプルなルール:
 * - 行 (\n 区切り) ごとにラベルらしさを判定
 * - ラベルが見つかったら現セクションを切替
 * - ラベルにマッチしない行は直前のセクションに追記
 */

// canonical ラベル → セクション
const LABEL_TO_SECTION: Record<string, SectionKey> = {
  // 企業情報
  企業名: "company",
  代表者: "company",
  所在地: "company",
  tel: "company",
  fax: "company",
  事業内容: "company",
  // 求人要件
  受入職種: "job",
  就労場所: "job",
  仕事内容: "job",
  求人数: "job",
  年齢: "job",
  性別: "job",
  国籍: "job",
  日本語レベル: "job",
  経験歴: "job",
  その他要件: "job",
  // 雇用区分
  雇用形態: "employment",
  雇用期間: "employment",
  ビザ: "employment",
  分野: "employment",
  最寄り駅: "employment",
  // 給与
  給料: "salary",
  基本給: "salary",
  月総支給: "salary",
  賞与: "salary",
  昇給: "salary",
  皆勤手当: "salary",
  住宅手当: "salary",
  深夜手当: "salary",
  通勤手当: "salary",
  固定残業代: "salary",
  固定残業時間: "salary",
  給与計算方法: "salary",
  給与締め日: "salary",
  給与支払日: "salary",
  // 就業時間
  勤務時間: "workingHours",
  勤務時間1: "workingHours",
  勤務時間2: "workingHours",
  勤務時間3: "workingHours",
  勤務時間4: "workingHours",
  休憩: "workingHours",
  残業有無: "workingHours",
  月平均残業時間: "workingHours",
  年間休日: "workingHours",
  年間労働時間: "workingHours",
  // 住宅
  住宅費: "housing",
  食費: "housing",
  光熱費: "housing",
  水道費: "housing",
  wifi費: "housing",
  寮有無: "housing",
  寮設備: "housing",
  通勤方法: "housing",
  自宅から職場までの時間: "housing",
  // 福利厚生
  社会保険: "benefits",
  休日: "benefits",
  有給休暇: "benefits",
  食事支援: "benefits",
  福利厚生: "benefits",
  // 雑
  試用期間: "misc",
  特記事項: "misc",
  選考フロー: "misc",
  入社日: "misc",
  面接日: "misc",
  案件番号: "misc",
  更新日: "misc",
};

const SECTIONS: SectionKey[] = [
  "company",
  "job",
  "employment",
  "salary",
  "workingHours",
  "housing",
  "benefits",
  "misc",
];

export type SegmentResult = {
  /** セクション別チャンク */
  chunks: SectionChunk[];
  /** ラベル未マッチ行 (デバッグ用) */
  unrecognizedLines: string[];
};

export function segmentPage(rawText: string): SegmentResult {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const buckets: Map<SectionKey, { lines: string[]; labels: Set<string> }> = new Map();
  for (const s of SECTIONS) buckets.set(s, { lines: [], labels: new Set() });

  let currentSection: SectionKey = "misc";
  const unrecognizedLines: string[] = [];

  for (const line of lines) {
    // ラベル候補: ":"" や "：" の左側 / 行頭の数文字
    const labelCandidate = extractLabelCandidate(line);
    let canonical = labelCandidate ? matchLabel(labelCandidate) : null;
    if (!canonical && labelCandidate) canonical = looseMatchLabel(labelCandidate);
    if (canonical && LABEL_TO_SECTION[canonical]) {
      currentSection = LABEL_TO_SECTION[canonical];
      buckets.get(currentSection)!.labels.add(canonical);
      buckets.get(currentSection)!.lines.push(line);
    } else {
      // 直前セクションに追記。よく分からない行は misc にも追記する
      buckets.get(currentSection)!.lines.push(line);
      if (!labelCandidate) unrecognizedLines.push(line);
    }
  }

  const chunks: SectionChunk[] = SECTIONS.map((s) => ({
    section: s,
    text: buckets.get(s)!.lines.join("\n"),
    labels: Array.from(buckets.get(s)!.labels),
  })).filter((c) => c.text.length > 0);

  return { chunks, unrecognizedLines };
}

function extractLabelCandidate(line: string): string | null {
  // "企業名: 株式会社○○" → "企業名"
  const colon = line.match(/^([^:：]{1,30})[:：]/);
  if (colon) return colon[1].trim();
  // "■企業名 株式会社○○" のように記号 + ラベル + 値
  const marker = line.match(/^[■◆●▲▼◇○・*]\s*([^\s]{1,15})/);
  if (marker) return marker[1];
  // "企業名 株式会社○○" のような空白区切り (短い先頭語)
  const head = line.match(/^([^\s]{2,10})\s+/);
  if (head) return head[1];
  return null;
}
