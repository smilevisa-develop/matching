"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 開いたままでもポータルの最新の出勤を出すため、1 分ごとに取り直す (裏のタブでは取り直さない) */
export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
