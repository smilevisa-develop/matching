"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** /personnel 配下の共通タブナビ (一覧 / 追加 / 一括登録) */
export default function PersonnelTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/personnel", label: "一覧", match: (p: string) => p === "/personnel" },
    { href: "/personnel/new", label: "追加", match: (p: string) => p === "/personnel/new" },
    {
      href: "/personnel/bulk-add",
      label: "一括登録",
      match: (p: string) => p === "/personnel/bulk-add",
    },
  ];
  return (
    <div className="border-b border-gray-200 -mx-8 px-8">
      <nav className="flex gap-1">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
