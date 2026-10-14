"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** この画面に戻ってきたときにサーバーの最新データを取り直す (別の画面・別の人の変更を反映する) */
export default function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
