"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import Sidebar from "./Sidebar";
import FeedbackWidget from "./FeedbackWidget";
import KeepOnBack from "./KeepOnBack";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal");
  const isAuth = pathname.startsWith("/login");
  // 候補者向け公開フォーム (intake) は token 認証で動作するためサイドバーも認証チェックも不要
  const isIntake = pathname.startsWith("/intake") || pathname.startsWith("/partner-intake");
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

  useEffect(() => {
    if (isPortal || isAuth || isIntake || isLegal || isChecklist || isJapaneseCheck || isDocumentCheck || isInterviewPractice) return;

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
  }, [isAuth, isPortal, isIntake, isLegal, isChecklist, isJapaneseCheck, isDocumentCheck, isInterviewPractice]);

  if (isPortal || isAuth || isIntake || isLegal || isChecklist || isJapaneseCheck || isDocumentCheck || isInterviewPractice) {
    return (
      <body className={`min-h-full ${isAuth ? "bg-[var(--color-text-dark)] text-white" : "bg-[var(--color-light)] text-[var(--color-text-dark)]"}`}>
        {children}
      </body>
    );
  }

  // チャットだけはスマホでも使う (LINE と同じ画面)。スマホではサイドバーと「修正依頼」を出さない
  const isChat = pathname === "/chat";

  return (
    <body className="h-full flex bg-[var(--color-light)] text-[var(--color-text-dark)]">
      <div className={isChat ? "hidden md:contents" : "contents"}>
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
      {/* 右下の「修正依頼」ボタン (使いにくいところ・不具合をスクショ付きですぐ送れる) */}
      <div className={isChat ? "hidden md:contents" : "contents"}>
        <FeedbackWidget />
      </div>
      <Suspense fallback={null}>
        <KeepOnBack />
      </Suspense>
    </body>
  );
}
