import type { Metadata } from "next";
import InterviewPracticeClient from "./InterviewPracticeClient";

export const metadata: Metadata = {
  title: "AI面接練習 | SMILE MATCHING",
};

/**
 * AI 面接練習の公開ページ (未ログイン)。
 * 候補者が自分で登録して、何度でも練習できる。結果は選考に使わない。
 */
export default function InterviewPracticePage() {
  return <InterviewPracticeClient />;
}
