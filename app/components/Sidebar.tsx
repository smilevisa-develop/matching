"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChartIcon,
  BoardIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  ChatIcon,
  ChevronUpDownIcon,
  CloseIcon,
  DocumentIcon,
  FlagIcon,
  FormIcon,
  GlobeIcon,
  GroupIcon,
  LinkIcon,
  ListCheckIcon,
  MegaphoneIcon,
  MenuIcon,
  MicIcon,
  ReceiptIcon,
  SettingsIcon,
  StarListIcon,
  SyncIcon,
  ClipboardIcon,
  UserCheckIcon,
  UsersIcon,
  YenIcon,
} from "./ui/icons";

/*
 * SmileReach のサイドバーと同じ作り (2026/11)。
 * 行き先 (名詞) だけを置き、「〜を追加」などの動作は各画面の右上のボタンにする。アイコンは項目ごとに別のものを使う。
 */
type NavItem = {
  label: string;
  href: string;
  icon: (props: { size?: number }) => React.ReactNode;
};

type SyncLine = { label: string; value: string; failed?: boolean };

const SECTIONS: { heading?: string; items: NavItem[] }[] = [
  {
    heading: "毎日の業務",
    items: [
      { label: "進捗管理", href: "/daily", icon: ListCheckIcon },
      { label: "チャット", href: "/chat", icon: ChatIcon },
      { label: "出勤表", href: "/attendance", icon: CalendarIcon },
    ],
  },
  {
    heading: "候補者",
    items: [
      { label: "候補者一覧", href: "/personnel", icon: UsersIcon },
      { label: "進捗ボード", href: "/personnel/progress", icon: BoardIcon },
      { label: "内定者管理", href: "/onboarding", icon: UserCheckIcon },
      { label: "AI面接練習の記録", href: "/interview-practice/log", icon: MicIcon },
    ],
  },
  {
    heading: "企業・紹介",
    items: [
      { label: "企業", href: "/companies", icon: BuildingIcon },
      { label: "履歴書", href: "/resumes", icon: DocumentIcon },
      { label: "求人票", href: "/job-postings", icon: BriefcaseIcon },
      { label: "推薦リスト", href: "/recommendations", icon: StarListIcon },
      { label: "請求管理", href: "/billing", icon: ReceiptIcon },
    ],
  },
  {
    heading: "パートナー",
    items: [
      { label: "パートナーリスト", href: "/partners", icon: GlobeIcon },
      { label: "パートナーアンケート", href: "/partners/survey", icon: ClipboardIcon },
      { label: "連絡先紐づけ", href: "/partners/link", icon: LinkIcon },
      { label: "一斉連絡", href: "/broadcast", icon: MegaphoneIcon },
      { label: "連絡テンプレート", href: "/broadcast/templates", icon: FormIcon },
      { label: "連絡グループ", href: "/broadcast/groups", icon: GroupIcon },
    ],
  },
  {
    heading: "数字",
    items: [
      { label: "KPIダッシュボード", href: "/kpi", icon: BarChartIcon },
      { label: "売上ダッシュボード", href: "/revenue", icon: YenIcon },
      { label: "SNS", href: "/sns", icon: BarChartIcon },
    ],
  },
  {
    items: [
      { label: "修正依頼", href: "/feedback", icon: FlagIcon },
      { label: "設定", href: "/settings", icon: SettingsIcon },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((section) => section.items);

// いまの URL にいちばん長く一致する項目を1つだけ選択中にする
function activeHref(pathname: string) {
  const matches = ALL_ITEMS.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  // 修正依頼の未対応件数
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);
  const [accountName, setAccountName] = useState("読み込み中...");
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{ ok: boolean; lines: SyncLine[] } | null>(null);
  const current = activeHref(pathname);

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
    const loadFeedback = () =>
      fetch("/api/feedback?count=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setOpenFeedbackCount(d.ok ? d.open ?? 0 : 0))
        .catch(() => undefined);
    void loadFeedback();

    const intervalId = window.setInterval(() => {
      void loadUnreadSummary();
    }, 8000);
    const feedbackInterval = window.setInterval(() => void loadFeedback(), 60000);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(feedbackInterval);
    };
  }, []);

  useEffect(() => {
    const loadAccount = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (data.ok && data.account) {
          setAccountName(data.account.name);
        } else {
          setAccountName("未ログイン");
        }
      } catch {
        setAccountName("未ログイン");
      }
    };

    void loadAccount();
  }, []);

  // スプシへの反映を定期実行を待たずに今すぐ走らせ、何が反映されたかを出す
  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSyncReport({ ok: false, lines: [{ label: "同期", value: data.error ?? res.statusText, failed: true }] });
        return;
      }
      const count = (n: unknown) => (Array.isArray(n) ? n.length : Number(n ?? 0));
      const changed = (updated: unknown, added: unknown) =>
        count(updated) + count(added) === 0 ? "変更なし" : `更新 ${count(updated)} ・ 追加 ${count(added)}`;
      const lines: SyncLine[] = [
        { label: "候補者 → スプシ", value: changed(data.result?.updated, data.result?.appended) },
        {
          label: "企業マスタ → システム",
          value: data.companyMaster ? changed(data.companyMaster.updated, data.companyMaster.created) : "対象外",
        },
      ];
      const drive = data.drive ?? {};
      if (drive.error || drive.failed?.length) {
        lines.push({
          label: "Drive フォルダ",
          value: drive.error ?? `失敗 ${drive.failed.length} 件（${drive.failed[0]}）`,
          failed: true,
        });
      } else {
        lines.push({
          label: "Drive フォルダ",
          value:
            count(drive.companies) + count(drive.persons) === 0
              ? "変更なし"
              : `企業 ${count(drive.companies)} ・ 候補者 ${count(drive.persons)}`,
        });
      }
      if (data.dealSyncError) {
        lines.push({ label: "企業・求人 → スプシ", value: data.dealSyncError, failed: true });
      } else {
        lines.push(
          { label: "企業 → スプシ", value: changed(0, data.companies?.appended) },
          {
            label: "求人 → スプシ",
            value: changed(data.deals?.updated, count(data.deals?.appended) + count(data.deals?.adopted)),
          },
        );
      }
      setSyncReport({ ok: lines.every((l) => !l.failed), lines });
    } catch {
      setSyncReport({ ok: false, lines: [{ label: "同期", value: "通信に失敗しました", failed: true }] });
    } finally {
      setSyncing(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const renderItem = (item: NavItem) => {
    const active = current === item.href;
    const Icon = item.icon;
    const badge = item.href === "/chat" ? unreadChatCount : item.href === "/feedback" ? openFeedbackCount : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex h-nav max-md:h-row items-center gap-2 rounded-button px-2 text-nav ${
          active ? "bg-side-active font-semibold text-white" : "text-side-ink hover:bg-side-hover hover:text-white"
        }`}
      >
        <span className={active ? "text-white" : "text-side-icon"}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {badge > 0 && (
          <span
            aria-label={`${badge}件`}
            className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold ${
              item.href === "/chat" ? "bg-white text-[var(--color-primary)]" : "bg-red-500 text-white"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* スマホ幅の上部バー。メニューを開くと行き先の一覧が画面全体に出る */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-row items-center bg-side md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={menuOpen}
          className="flex h-row w-row items-center justify-center text-white"
        >
          {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
        </button>
        <Wordmark />
      </div>

      <aside
        className={`z-20 flex-col bg-side max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-row md:sticky md:top-0 md:flex md:h-screen md:w-side md:shrink-0 ${
          menuOpen ? "flex" : "hidden"
        }`}
      >
        <div className="hidden h-row shrink-0 items-center pl-logo-inset md:flex">
          <Wordmark />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {SECTIONS.map((section, index) => (
            <div key={section.heading ?? "other"} className={index === 0 ? "pt-2" : "mt-4 border-t border-side-line pt-4"}>
              {section.heading && <p className="px-2 pb-2 text-body font-bold text-white">{section.heading}</p>}
              <div className="flex flex-col">{section.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        {/* 名前の欄。サイドバーと同じ暗い地のまま、線と一段濃い地で一覧と分ける */}
        <div className="relative flex shrink-0 items-center gap-2 border-t border-side-line bg-black/20 p-2">
          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            className="flex h-control min-w-0 flex-1 items-center gap-1 rounded-button px-2 text-left text-white hover:bg-side-hover"
          >
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{accountName}</span>
            <ChevronUpDownIcon size={16} className="shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="flex h-control shrink-0 items-center gap-1 rounded-button border border-white/20 bg-[var(--color-primary)] px-2 text-note font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            <SyncIcon size={16} className={syncing ? "animate-spin" : undefined} />
            {syncing ? "同期中" : "同期"}
          </button>
          {accountOpen && (
            <div className="absolute inset-x-2 bottom-full mb-1 rounded-button border border-gray-200 bg-white p-2 shadow-float">
              <button
                type="button"
                onClick={() => void logout()}
                className="flex h-control max-md:h-row w-full items-center rounded-field px-2 text-body text-[var(--color-text-dark)] hover:bg-[var(--color-light)]"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>

      {syncReport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSyncReport(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-bold text-[var(--color-text-dark)]">
              {syncReport.ok ? "同期が完了しました" : "同期できなかった項目があります"}
            </p>
            <ul className="mt-4 divide-y divide-gray-100 text-sm">
              {syncReport.lines.map((line) => (
                <li key={line.label} className="flex items-start justify-between gap-3 py-2">
                  <span className="shrink-0">
                    <span className={line.failed ? "text-red-600" : "text-emerald-600"}>
                      {line.failed ? "✕" : "✓"}
                    </span>{" "}
                    {line.label}
                  </span>
                  <span className={`text-right ${line.failed ? "text-red-600" : "text-gray-500"}`}>
                    {line.value}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSyncReport(null)}
              className="mt-4 w-full rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
      </aside>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex h-row items-center gap-2">
      <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-field bg-white object-contain" priority />
      <span className="whitespace-nowrap text-label font-bold text-white">SMILE MATCHING</span>
    </Link>
  );
}
