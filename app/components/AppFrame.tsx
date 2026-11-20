"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import Sidebar from "./Sidebar";
import KeepOnBack from "./KeepOnBack";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal");
  const isAuth = pathname.startsWith("/login");
  // 候補者向け公開フォーム (intake) は token 認証で動作するためサイドバーも認証チェックも不要
  const isIntake =
    pathname.startsWith("/intake") || pathname.startsWith("/partner-intake") || pathname.startsWith("/partner-survey");
  // 法的文書ページ (Meta App Review 要件) は完全公開
  const isLegal = pathname.startsWith("/legal");
  // 母国語チェックリスト (公開・token 認証)
  const isChecklist = pathname.startsWith("/checklist");
  // 日本語チェック (公開・専用 token 認証。入力フォームとは別リンク)
  const isJapaneseCheck = pathname.startsWith("/japanese-check");
  // 内定後の事前確認資料 (公開・token 認証)
  const isDocumentCheck = pathname.startsWith("/document-check");
  // AI 面接練習 (公開・候補者が自分で登録する)。担当者用の記録ページ (/interview-practice/log) は対象外
  const isInterviewPractice = pathname === "/interview-practice";
  // 企業向けの推薦リスト (公開・token 認証。見るだけ)
  const isShareList = pathname.startsWith("/list/");
  // 案件ボード (パートナー向け・専用リンク)。社員用の /board-manage は対象外
  const isBoard = pathname === "/board" || pathname.startsWith("/board/");

  useEffect(() => {
    if (isPortal || isAuth || isIntake || isLegal || isChecklist || isJapaneseCheck || isDocumentCheck || isInterviewPractice || isShareList || isBoard) return;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (!data.ok || !data.account) {
          window.location.href = "/login";
        }
      } catch {
        window.location.href = "/login";
      }
    };

    void checkSession();
  }, [isAuth, isPortal, isIntake, isLegal, isChecklist, isJapaneseCheck, isDocumentCheck, isInterviewPractice, isShareList, isBoard]);

  if (isPortal || isAuth || isIntake || isLegal || isChecklist || isJapaneseCheck || isDocumentCheck || isInterviewPractice || isShareList || isBoard) {
    return (
      // 社外の人が見るページは SMILE MATCHING のサイトの色 (globals.css の .brand-external)。ログイン画面とポータルは社内向けなので緑のまま
      <body
        className={`min-h-full ${isAuth ? "bg-[var(--color-text-dark)] text-white" : "bg-[var(--color-light)] text-[var(--color-text-dark)]"} ${isAuth || isPortal ? "" : "brand-external"}`}
      >
        {children}
      </body>
    );
  }

  // チャットだけはスマホでも使う (LINE と同じ画面)。スマホではサイドバーを出さない
  const isChat = pathname === "/chat";

  return (
    <body className="h-full flex bg-[var(--color-light)] text-[var(--color-text-dark)]">
      <div className={isChat ? "hidden md:contents" : "contents"}>
        <Sidebar />
      </div>
      <main className={`min-w-0 flex-1 overflow-y-auto ${isChat ? "" : "max-md:pt-row"}`}>
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
      {/* 右下の「修正依頼」ボタンは外した (2026-11-18 土田さん。依頼は Slack で受けて「自動で修正」で直す) */}
      <Suspense fallback={null}>
        <KeepOnBack />
      </Suspense>
    </body>
  );
}
