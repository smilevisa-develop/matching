"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./Sidebar";

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal");
  const isAuth = pathname.startsWith("/login");
  // 候補者向け公開フォーム (intake) は token 認証で動作するためサイドバーも認証チェックも不要
  const isIntake = pathname.startsWith("/intake");
  // 法的文書ページ (Meta App Review 要件) は完全公開
  const isLegal = pathname.startsWith("/legal");
  // 母国語チェックリスト (公開・token 認証)
  const isChecklist = pathname.startsWith("/checklist");

  useEffect(() => {
    if (isPortal || isAuth || isIntake || isLegal || isChecklist) return;

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
  }, [isAuth, isPortal, isIntake, isLegal, isChecklist]);

  if (isPortal || isAuth || isIntake || isLegal || isChecklist) {
    return (
      <body className={`min-h-full ${isAuth ? "bg-[var(--color-text-dark)] text-white" : "bg-[var(--color-light)] text-[var(--color-text-dark)]"}`}>
        {children}
      </body>
    );
  }

  return (
    <body className="h-full flex bg-[var(--color-light)] text-[var(--color-text-dark)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </body>
  );
}
