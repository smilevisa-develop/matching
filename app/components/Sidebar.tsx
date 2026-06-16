"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: (props: { active: boolean }) => React.ReactNode;
  children?: { label: string; href: string }[];
};

function PersonnelIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function BroadcastIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h10" />
      <path d="M14 8l6 4-6 4V8z" />
      <path d="M4 6h6" />
      <path d="M4 18h6" />
    </svg>
  );
}

function InvoiceIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M14 2v5h5" />
      <path d="M12 11v8" />
      <path d="M15 13h-4.5a1.5 1.5 0 1 0 0 3h3a1.5 1.5 0 1 1 0 3H9" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV: NavItem[] = [
  {
    label: "候補者",
    href: "/personnel",
    icon: PersonnelIcon,
    children: [
      { label: "候補者一覧", href: "/personnel" },
      { label: "候補者を追加", href: "/personnel/new" },
      { label: "一括登録 (AI)", href: "/personnel/bulk-add" },
    ],
  },
  {
    label: "企業",
    href: "/companies",
    icon: PersonnelIcon,
    children: [
      { label: "企業一覧", href: "/companies" },
      { label: "案件管理", href: "/companies/deals" },
    ],
  },
  {
    label: "パートナー",
    href: "/partners",
    icon: PersonnelIcon,
    children: [
      { label: "パートナーリスト", href: "/partners" },
      { label: "連絡先紐づけ", href: "/partners/link" },
      { label: "一斉連絡", href: "/broadcast" },
      { label: "連絡テンプレート", href: "/broadcast/templates" },
      { label: "連絡グループ", href: "/broadcast/groups" },
    ],
  },
  {
    label: "紹介業務",
    href: "/resumes",
    icon: BroadcastIcon,
    children: [
      { label: "履歴書作成", href: "/resumes" },
      { label: "求人票作成", href: "/job-postings" },
      { label: "推薦リスト", href: "/recommendations" },
    ],
  },
  {
    label: "請求",
    href: "/invoices",
    icon: InvoiceIcon,
    children: [
      { label: "入社進捗", href: "/placements" },
      { label: "企業への請求", href: "/invoices/companies" },
      { label: "PAへの請求", href: "/invoices/partners" },
    ],
  },
  { label: "売上ダッシュボード", href: "/revenue", icon: BroadcastIcon },
  { label: "チャット", href: "/chat", icon: ChatIcon },
  { label: "設定", href: "/settings", icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [accountName, setAccountName] = useState("読み込み中...");
  const [accountRole, setAccountRole] = useState("");

  const isSectionActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isChildActive = (href: string) => {
    return pathname === href;
  };

  const toggleItem = (href: string) => {
    setOpenItems((current) =>
      current.includes(href)
        ? current.filter((item) => item !== href)
        : [...current, href]
    );
  };

  useEffect(() => {
    const loadUnreadSummary = async () => {
      try {
        const res = await fetch("/api/messages?summary=true", { cache: "no-store" });
        const data = await res.json();
        if (data.ok) {
          setUnreadChatCount(data.unreadInboundCount ?? 0);
        }
      } catch {
        setUnreadChatCount(0);
      }
    };

    void loadUnreadSummary();

    const intervalId = window.setInterval(() => {
      void loadUnreadSummary();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const loadAccount = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (data.ok && data.account) {
          setAccountName(data.account.name);
          setAccountRole(data.account.role === "admin" ? "管理者" : "通常アカウント");
        } else {
          setAccountName("未ログイン");
          setAccountRole("");
        }
      } catch {
        setAccountName("未ログイン");
        setAccountRole("");
      }
    };

    void loadAccount();
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <aside className="w-72 shrink-0 bg-[var(--color-text-dark)] text-white flex flex-col h-screen sticky top-0 px-4 py-5">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
      >
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(37,99,235,0.15)] ring-1 ring-white/15">
          <Image
            src="/logo.png"
            alt="SMILE MATCHING"
            width={56}
            height={56}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <div>
          <p className="text-lg font-bold leading-[0.95] tracking-[0.18em] text-white">
            <span className="block">SMILE</span>
            <span className="block">MATCHING</span>
          </p>
          <p className="mt-1 text-xs text-white/50">人材紹介ダッシュボード</p>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto py-6 space-y-3">
        {NAV.map((item) => {
          const active = isSectionActive(item.href);
          const expanded = active || openItems.includes(item.href);
          const Icon = item.icon;

          return (
            <div
              key={item.href}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-2"
            >
            {item.children ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleItem(item.href)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                    active
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon active={active} />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {expanded && (
                  <div className="mt-2 space-y-1 px-2 pb-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors ${
                          isChildActive(child.href)
                            ? "bg-white/12 text-white font-medium"
                            : "text-white/65 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-white font-medium"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon active={active} />
                <span className="flex-1">{item.label}</span>
                {item.href === "/chat" && unreadChatCount > 0 && (
                  <span className="min-w-5 rounded-full bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold text-[var(--color-primary)]">
                    {unreadChatCount}
                  </span>
                )}
              </Link>
            )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm font-medium text-white">{accountName}</p>
          <p className="mt-1 text-xs text-white/55">{accountRole}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
