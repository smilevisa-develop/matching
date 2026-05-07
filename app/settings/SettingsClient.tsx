"use client";

import { useMemo, useState } from "react";
import type { FixedQuestionSetting } from "@/lib/app-settings";
import {
  RECOMMENDATION_COLUMN_OPTIONS,
  type RecommendationColumnKey,
} from "@/lib/recommendation-columns";

type AccountSummary = {
  id: number;
  loginId: string;
  name: string;
  role: string;
};

type ResumeTemplate = {
  id: number;
  name: string;
  templateUrl: string;
  driveFolderUrl: string | null;
};

export default function SettingsClient({
  initialSettings,
  currentAccount,
  accounts,
  resumeTemplates: initialResumeTemplates,
  jobPostingTemplates: initialJobPostingTemplates,
}: {
  initialSettings: {
    calendarEmbedUrl: string;
    calendarLabel: string;
    fixedQuestions: FixedQuestionSetting[];
    recommendationColumns: string[];
    monthlyOfferTarget: number | null;
    monthlyRevenueTarget: number | null;
    monthlyTargets: {
      month: string;
      offer: number | null;
      revenue: number | null;
      jobOpenings?: number | null;
      recommendCount?: number | null;
    }[];
    recommendationTemplateUrl: string;
  };
  currentAccount: {
    id: number;
    loginId: string;
    name: string;
    role: string;
  };
  accounts: AccountSummary[];
  resumeTemplates: ResumeTemplate[];
  jobPostingTemplates: ResumeTemplate[];
}) {
  const isAdmin = currentAccount.role === "admin";
  const [calendarEmbedUrl, setCalendarEmbedUrl] = useState(initialSettings.calendarEmbedUrl);
  const [calendarLabel, setCalendarLabel] = useState(initialSettings.calendarLabel);
  const [fixedQuestions, setFixedQuestions] = useState(initialSettings.fixedQuestions);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [fixedQuestionsOpen, setFixedQuestionsOpen] = useState(false);
  const [recommendationColumns, setRecommendationColumns] = useState<string[]>(initialSettings.recommendationColumns);
  const [recommendationColumnsOpen, setRecommendationColumnsOpen] = useState(false);
  const [savingRecommendationColumns, setSavingRecommendationColumns] = useState(false);
  const [recommendationTemplateUrl, setRecommendationTemplateUrl] = useState<string>(
    initialSettings.recommendationTemplateUrl ?? ""
  );
  const [savingRecommendationTemplate, setSavingRecommendationTemplate] = useState(false);
  const saveRecommendationTemplate = async () => {
    setSavingRecommendationTemplate(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationTemplateUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      alert("推薦リストテンプレを保存しました");
    } finally {
      setSavingRecommendationTemplate(false);
    }
  };
  type MonthlyTargetRow = {
    month: string;
    offer: string;
    revenue: string;
    jobOpenings: string;
    recommendCount: string;
  };
  const toRow = (t: {
    month: string;
    offer: number | null;
    revenue: number | null;
    jobOpenings?: number | null;
    recommendCount?: number | null;
  }): MonthlyTargetRow => ({
    month: t.month,
    offer: t.offer != null ? String(t.offer) : "",
    revenue: t.revenue != null ? String(t.revenue) : "",
    jobOpenings: t.jobOpenings != null ? String(t.jobOpenings) : "",
    recommendCount: t.recommendCount != null ? String(t.recommendCount) : "",
  });
  const initialRows: MonthlyTargetRow[] =
    initialSettings.monthlyTargets.length > 0
      ? initialSettings.monthlyTargets.map(toRow)
      : initialSettings.monthlyOfferTarget != null || initialSettings.monthlyRevenueTarget != null
        ? [
            {
              month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
              offer:
                initialSettings.monthlyOfferTarget != null ? String(initialSettings.monthlyOfferTarget) : "",
              revenue:
                initialSettings.monthlyRevenueTarget != null ? String(initialSettings.monthlyRevenueTarget) : "",
              jobOpenings: "",
              recommendCount: "",
            },
          ]
        : [];
  const [monthlyTargetRows, setMonthlyTargetRows] = useState<MonthlyTargetRow[]>(initialRows);
  const [monthlyTargetOpen, setMonthlyTargetOpen] = useState(false);
  const [savingMonthlyTarget, setSavingMonthlyTarget] = useState(false);

  const addMonthlyTargetRow = () => {
    // 既存行の最終月の次月をデフォルトに、無ければ当月
    const last = monthlyTargetRows[monthlyTargetRows.length - 1];
    let defaultMonth: string;
    if (last) {
      const [y, m] = last.month.split("-").map(Number);
      const next = new Date(y, m, 1); // m は 1-based のまま渡すと翌月になる
      defaultMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    } else {
      const now = new Date();
      defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    setMonthlyTargetRows((current) => [
      ...current,
      { month: defaultMonth, offer: "", revenue: "", jobOpenings: "", recommendCount: "" },
    ]);
  };

  const updateMonthlyTargetRow = (index: number, patch: Partial<MonthlyTargetRow>) => {
    setMonthlyTargetRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const removeMonthlyTargetRow = (index: number) => {
    setMonthlyTargetRows((current) => current.filter((_, i) => i !== index));
  };

  const saveMonthlyTarget = async () => {
    // 空の月は除外、月の重複もまとめる
    const seen = new Set<string>();
    const cleaned = monthlyTargetRows
      .filter((r) => /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) && !seen.has(r.month) && (seen.add(r.month) || true))
      .map((r) => ({
        month: r.month,
        offer: r.offer.trim() === "" ? null : Number(r.offer.replace(/[,\s]/g, "")),
        revenue: r.revenue.trim() === "" ? null : Number(r.revenue.replace(/[,\s]/g, "")),
        jobOpenings: r.jobOpenings.trim() === "" ? null : Number(r.jobOpenings.replace(/[,\s]/g, "")),
        recommendCount:
          r.recommendCount.trim() === "" ? null : Number(r.recommendCount.replace(/[,\s]/g, "")),
      }));
    setSavingMonthlyTarget(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyTargets: cleaned }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      alert(`月次目標を保存しました (${cleaned.length} 件)`);
    } finally {
      setSavingMonthlyTarget(false);
    }
  };
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [resumeTemplatesOpen, setResumeTemplatesOpen] = useState(false);
  const [resumeTemplates, setResumeTemplates] = useState<ResumeTemplate[]>(initialResumeTemplates);
  const [newTemplate, setNewTemplate] = useState({ name: "", templateUrl: "", driveFolderUrl: "" });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [jobPostingTemplatesOpen, setJobPostingTemplatesOpen] = useState(false);
  const [jobPostingTemplates, setJobPostingTemplates] = useState<ResumeTemplate[]>(initialJobPostingTemplates);
  const [newJobPostingTemplate, setNewJobPostingTemplate] = useState({ name: "", templateUrl: "", driveFolderUrl: "" });
  const [savingJobPostingTemplate, setSavingJobPostingTemplate] = useState(false);
  const [passcodes, setPasscodes] = useState<Record<number, string>>({});
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [savingPasscodeId, setSavingPasscodeId] = useState<number | null>(null);

  const accountRows = useMemo(() => accounts.filter((account) => account.id !== currentAccount.id), [accounts, currentAccount.id]);

  const toggleRecommendationColumn = (key: string) => {
    setRecommendationColumns((current) =>
      current.includes(key) ? current.filter((c) => c !== key) : [...current, key]
    );
  };

  const saveRecommendationColumns = async () => {
    setSavingRecommendationColumns(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationColumns }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      setRecommendationColumns(data.settings.recommendationColumns ?? recommendationColumns);
      alert("推薦リストの出力項目を保存しました");
    } finally {
      setSavingRecommendationColumns(false);
    }
  };

  const saveCalendar = async () => {
    setSavingCalendar(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarEmbedUrl,
          calendarLabel,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      alert("自分のカレンダー設定を保存しました");
    } finally {
      setSavingCalendar(false);
    }
  };

  const clearCalendar = async () => {
    setCalendarEmbedUrl("");
    setCalendarLabel("");
    setSavingCalendar(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarEmbedUrl: "",
          calendarLabel: "",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`解除失敗: ${data.error}`);
        return;
      }
      alert("カレンダー連携を解除しました");
    } finally {
      setSavingCalendar(false);
    }
  };

  const saveFixedQuestions = async () => {
    setSavingQuestions(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixedQuestions,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      setFixedQuestions(data.settings.fixedQuestions);
      alert("共通の固定質問を保存しました");
    } finally {
      setSavingQuestions(false);
    }
  };

  const updateFixedQuestion = (fixedKey: string, patch: Partial<FixedQuestionSetting>) => {
    setFixedQuestions((current) =>
      current.map((question) =>
        question.fixedKey === fixedKey ? { ...question, ...patch } : question
      )
    );
  };

  const addResumeTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.templateUrl.trim()) {
      alert("テンプレート名と Docs URL を入力してください");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/resume-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplate),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }
      setResumeTemplates((current) => [data.template, ...current]);
      setNewTemplate({ name: "", templateUrl: "", driveFolderUrl: "" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const updateResumeTemplate = async (id: number, patch: Partial<ResumeTemplate>) => {
    const previous = resumeTemplates;
    setResumeTemplates((current) => current.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/resume-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "更新に失敗しました");
      setResumeTemplates(previous);
    }
  };

  const addJobPostingTemplate = async () => {
    if (!newJobPostingTemplate.name.trim() || !newJobPostingTemplate.templateUrl.trim()) {
      alert("テンプレート名と Docs URL を入力してください");
      return;
    }
    setSavingJobPostingTemplate(true);
    try {
      const res = await fetch("/api/job-posting-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newJobPostingTemplate),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }
      setJobPostingTemplates((current) => [data.template, ...current]);
      setNewJobPostingTemplate({ name: "", templateUrl: "", driveFolderUrl: "" });
    } finally {
      setSavingJobPostingTemplate(false);
    }
  };

  const updateJobPostingTemplate = async (id: number, patch: Partial<ResumeTemplate>) => {
    const previous = jobPostingTemplates;
    setJobPostingTemplates((current) => current.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const res = await fetch(`/api/job-posting-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "更新に失敗しました");
      setJobPostingTemplates(previous);
    }
  };

  const deleteJobPostingTemplate = async (id: number, name: string) => {
    if (!confirm(`「${name}」を削除しますか?`)) return;
    const res = await fetch(`/api/job-posting-templates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "削除に失敗しました");
      return;
    }
    setJobPostingTemplates((current) => current.filter((t) => t.id !== id));
  };

  const deleteResumeTemplate = async (id: number, name: string) => {
    if (!confirm(`「${name}」を削除しますか?`)) return;
    const res = await fetch(`/api/resume-templates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || "削除に失敗しました");
      return;
    }
    setResumeTemplates((current) => current.filter((t) => t.id !== id));
  };

  const switchAccount = async (accountId: number) => {
    setSwitchingId(accountId);
    try {
      const res = await fetch("/api/auth/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`切替失敗: ${data.error}`);
        return;
      }
      window.location.href = "/";
    } finally {
      setSwitchingId(null);
    }
  };

  const savePasscode = async (accountId: number) => {
    const passcode = passcodes[accountId]?.trim() ?? "";
    if (passcode.length < 6) {
      alert("パスコードは6文字以上で入力してください");
      return;
    }

    setSavingPasscodeId(accountId);
    try {
      const res = await fetch("/api/auth/passcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, passcode }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`更新失敗: ${data.error}`);
        return;
      }
      setPasscodes((current) => ({ ...current, [accountId]: "" }));
      alert("パスコードを更新しました");
    } finally {
      setSavingPasscodeId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SummaryCard currentAccount={currentAccount} />

      <SectionCard
        title="自分のカレンダー"
        description="各アカウントごとに Google / Outlook の面談カレンダーを登録できます。"
        open={calendarOpen}
        onToggle={() => setCalendarOpen((current) => !current)}
      >
        <div className="space-y-4">
          <Field label="表示名">
            <input
              className={INPUT}
              value={calendarLabel}
              onChange={(event) => setCalendarLabel(event.target.value)}
              placeholder="Google Calendar"
            />
          </Field>
          <Field label="埋め込みURL">
            <input
              className={INPUT}
              value={calendarEmbedUrl}
              onChange={(event) => setCalendarEmbedUrl(event.target.value)}
              placeholder="https://calendar.google.com/calendar/embed?src=..."
            />
          </Field>
          <div className="flex gap-3">
            <ActionButton onClick={saveCalendar} disabled={savingCalendar}>
              {savingCalendar ? "保存中..." : "自分のカレンダーを保存"}
            </ActionButton>
            <SecondaryButton onClick={clearCalendar} disabled={savingCalendar}>
              リンクを解除
            </SecondaryButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="履歴書テンプレート"
        description="Google Docs テンプレートを登録します。作成した履歴書は候補者ごとの Drive フォルダに自動保存されます (候補者IDで既存フォルダを検索し、無ければ新規作成)。"
        open={resumeTemplatesOpen}
        onToggle={() => setResumeTemplatesOpen((current) => !current)}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {resumeTemplates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4">
                <div className="grid gap-3">
                  <Field label="テンプレート名">
                    <input
                      className={INPUT}
                      value={template.name}
                      onChange={(e) => setResumeTemplates((cur) => cur.map((t) => t.id === template.id ? { ...t, name: e.target.value } : t))}
                      onBlur={(e) => void updateResumeTemplate(template.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Google Docs テンプレートURL">
                    <input
                      className={INPUT}
                      value={template.templateUrl}
                      onChange={(e) => setResumeTemplates((cur) => cur.map((t) => t.id === template.id ? { ...t, templateUrl: e.target.value } : t))}
                      onBlur={(e) => void updateResumeTemplate(template.id, { templateUrl: e.target.value })}
                      placeholder="https://docs.google.com/document/d/..."
                    />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void deleteResumeTemplate(template.id, template.name)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {resumeTemplates.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
                まだテンプレートがありません
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">新しいテンプレートを追加</p>
            <p className="mt-1 text-xs text-gray-500">作成した履歴書は候補者フォルダに自動保存されます。</p>
            <div className="mt-3 grid gap-3">
              <Field label="テンプレート名">
                <input
                  className={INPUT}
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate((c) => ({ ...c, name: e.target.value }))}
                  placeholder="標準履歴書"
                />
              </Field>
              <Field label="Google Docs テンプレートURL">
                <input
                  className={INPUT}
                  value={newTemplate.templateUrl}
                  onChange={(e) => setNewTemplate((c) => ({ ...c, templateUrl: e.target.value }))}
                  placeholder="https://docs.google.com/document/d/..."
                />
              </Field>
              <ActionButton onClick={addResumeTemplate} disabled={savingTemplate}>
                {savingTemplate ? "保存中..." : "テンプレートを追加"}
              </ActionButton>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="求人票テンプレート"
        description="求人票作成用の Google Docs テンプレートを登録します。作成した求人票は案件に紐づく企業の Drive フォルダに自動保存されます。"
        open={jobPostingTemplatesOpen}
        onToggle={() => setJobPostingTemplatesOpen((current) => !current)}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {jobPostingTemplates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4">
                <div className="grid gap-3">
                  <Field label="テンプレート名">
                    <input
                      className={INPUT}
                      value={template.name}
                      onChange={(e) => setJobPostingTemplates((cur) => cur.map((t) => t.id === template.id ? { ...t, name: e.target.value } : t))}
                      onBlur={(e) => void updateJobPostingTemplate(template.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Google Docs テンプレートURL">
                    <input
                      className={INPUT}
                      value={template.templateUrl}
                      onChange={(e) => setJobPostingTemplates((cur) => cur.map((t) => t.id === template.id ? { ...t, templateUrl: e.target.value } : t))}
                      onBlur={(e) => void updateJobPostingTemplate(template.id, { templateUrl: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void deleteJobPostingTemplate(template.id, template.name)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
            {jobPostingTemplates.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
                まだテンプレートがありません
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">新しいテンプレートを追加</p>
            <div className="mt-3 grid gap-3">
              <Field label="テンプレート名">
                <input
                  className={INPUT}
                  value={newJobPostingTemplate.name}
                  onChange={(e) => setNewJobPostingTemplate((c) => ({ ...c, name: e.target.value }))}
                  placeholder="特定技能 標準求人票"
                />
              </Field>
              <Field label="Google Docs テンプレートURL">
                <input
                  className={INPUT}
                  value={newJobPostingTemplate.templateUrl}
                  onChange={(e) => setNewJobPostingTemplate((c) => ({ ...c, templateUrl: e.target.value }))}
                />
              </Field>
              <p className="text-xs text-gray-500">作成した求人票は企業フォルダに自動保存されます。</p>
              <ActionButton onClick={addJobPostingTemplate} disabled={savingJobPostingTemplate}>
                {savingJobPostingTemplate ? "保存中..." : "テンプレートを追加"}
              </ActionButton>
            </div>
          </div>
        </div>
      </SectionCard>

      {isAdmin && (
        <SectionCard
          title="月次目標"
          description="売上ダッシュボードのゲージで使う、月ごとの内定数と売上の目標値を積み上げで管理します。"
          open={monthlyTargetOpen}
          onToggle={() => setMonthlyTargetOpen((current) => !current)}
        >
          <div className="space-y-3">
            {monthlyTargetRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                まだ目標が設定されていません。「+ 月を追加」から作成してください。
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[140px_repeat(4,1fr)_40px] gap-2 px-2 text-[11px] font-medium text-gray-500 md:grid">
                  <span>月</span>
                  <span>求人数 目標</span>
                  <span>推薦社数 目標</span>
                  <span>内定者数 目標</span>
                  <span>売上 目標 (円)</span>
                  <span></span>
                </div>
                {monthlyTargetRows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-2 md:grid-cols-[140px_repeat(4,1fr)_40px]"
                  >
                    <input
                      className={INPUT}
                      type="month"
                      value={row.month}
                      onChange={(e) => updateMonthlyTargetRow(index, { month: e.target.value })}
                    />
                    <input
                      className={INPUT}
                      type="number"
                      min={0}
                      value={row.jobOpenings}
                      onChange={(e) => updateMonthlyTargetRow(index, { jobOpenings: e.target.value })}
                      placeholder="例: 5"
                    />
                    <input
                      className={INPUT}
                      type="number"
                      min={0}
                      value={row.recommendCount}
                      onChange={(e) => updateMonthlyTargetRow(index, { recommendCount: e.target.value })}
                      placeholder="例: 8"
                    />
                    <input
                      className={INPUT}
                      type="number"
                      min={0}
                      value={row.offer}
                      onChange={(e) => updateMonthlyTargetRow(index, { offer: e.target.value })}
                      placeholder="例: 3"
                    />
                    <input
                      className={INPUT}
                      type="number"
                      min={0}
                      value={row.revenue}
                      onChange={(e) => updateMonthlyTargetRow(index, { revenue: e.target.value })}
                      placeholder="例: 1500000"
                    />
                    <button
                      type="button"
                      onClick={() => removeMonthlyTargetRow(index)}
                      title="この月を削除"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addMonthlyTargetRow}
                className="rounded-lg border border-[var(--color-secondary)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-light)]"
              >
                + 月を追加
              </button>
              <ActionButton onClick={saveMonthlyTarget} disabled={savingMonthlyTarget}>
                {savingMonthlyTarget ? "保存中..." : "目標を保存"}
              </ActionButton>
            </div>
            <p className="text-[11px] text-gray-500">
              該当月の目標が無い場合は、それより前で最も新しい月の目標が引き継がれます (繰り越し)。
            </p>
          </div>
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard
          title="推薦リストの出力項目"
          description="推薦リスト (Drive 保存 / CSV ダウンロード) で出力するカラムを選びます。ID / 進捗 / 備考 は固定で必ず出ます。"
          open={recommendationColumnsOpen}
          onToggle={() => setRecommendationColumnsOpen((current) => !current)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
              <p className="text-xs text-gray-500">
                チェックを入れた項目が、案件ごとに作成される推薦リストの列として候補者情報から自動入力されます。
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {RECOMMENDATION_COLUMN_OPTIONS.map((option) => {
                  const checked = recommendationColumns.includes(option.key);
                  return (
                    <label
                      key={option.key}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                        checked
                          ? "border-[var(--color-primary)] bg-white"
                          : "border-gray-200 bg-white hover:bg-[var(--color-light)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecommendationColumn(option.key)}
                        className="accent-[var(--color-primary)]"
                      />
                      <span className="text-[var(--color-text-dark)]">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500">
                  選択中: {recommendationColumns.length} 項目
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setRecommendationColumns(
                      RECOMMENDATION_COLUMN_OPTIONS.map((c) => c.key as RecommendationColumnKey)
                    )
                  }
                  className="text-xs text-[var(--color-primary)] hover:underline"
                >
                  全部選択
                </button>
              </div>
            </div>
            <ActionButton onClick={saveRecommendationColumns} disabled={savingRecommendationColumns}>
              {savingRecommendationColumns ? "保存中..." : "出力項目を保存"}
            </ActionButton>
            <div className="mt-6 rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">推薦リストテンプレ (Google Sheets)</p>
              <p className="mt-1 text-xs text-gray-500">
                登録されたテンプレを企業フォルダに複製してデータを書き込みます。
                テンプレの 1 行目を見出し行として設定で選んだ列名と一致させると自動的にマッピングされます。
                未設定の場合は CSV から新規 Sheets を生成します。
              </p>
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <input
                  className={`${INPUT} flex-1`}
                  type="url"
                  value={recommendationTemplateUrl}
                  onChange={(e) => setRecommendationTemplateUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <ActionButton onClick={saveRecommendationTemplate} disabled={savingRecommendationTemplate}>
                  {savingRecommendationTemplate ? "保存中..." : "テンプレを保存"}
                </ActionButton>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard
          title="共通の初期入力ルール"
          description="候補者へ送る入力依頼フォームで、最初に必ず出る固定質問の内容を管理者だけが変更できます。"
          open={fixedQuestionsOpen}
          onToggle={() => setFixedQuestionsOpen((current) => !current)}
        >
          <div className="space-y-4">
            {fixedQuestions.map((question) => (
              <div
                key={question.fixedKey}
                className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px]">
                  <Field label="質問名">
                    <input
                      className={INPUT}
                      value={question.label}
                      onChange={(event) =>
                        updateFixedQuestion(question.fixedKey, { label: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="回答形式">
                    <select
                      className={INPUT}
                      value={question.type}
                      onChange={(event) =>
                        updateFixedQuestion(question.fixedKey, {
                          type: event.target.value === "file" ? "file" : "text",
                        })
                      }
                    >
                      <option value="text">テキスト</option>
                      <option value="file">ファイル</option>
                    </select>
                  </Field>
                  <Field label="必須設定">
                    <select
                      className={INPUT}
                      value={question.required ? "required" : "optional"}
                      onChange={(event) =>
                        updateFixedQuestion(question.fixedKey, {
                          required: event.target.value === "required",
                        })
                      }
                    >
                      <option value="required">必須</option>
                      <option value="optional">任意</option>
                    </select>
                  </Field>
                </div>
              </div>
            ))}
            <ActionButton onClick={saveFixedQuestions} disabled={savingQuestions}>
              {savingQuestions ? "保存中..." : "共通ルールを保存"}
            </ActionButton>
          </div>
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard
          title="アカウント管理"
          description="管理者は各メンバーのパスコード変更と、ログインなしでのアカウント切替ができます。"
          open={accountsOpen}
          onToggle={() => setAccountsOpen((current) => !current)}
        >
          <div className="space-y-4">
            {accountRows.map((account) => (
              <div
                key={account.id}
                className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">{account.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {account.loginId} / {account.role === "admin" ? "管理者" : "通常アカウント"}
                    </p>
                  </div>
                  <SecondaryButton
                    onClick={() => void switchAccount(account.id)}
                    disabled={switchingId === account.id}
                  >
                    {switchingId === account.id ? "切替中..." : "このアカウントに入る"}
                  </SecondaryButton>
                </div>
                <div className="mt-4 flex gap-3">
                  <input
                    className={INPUT}
                    type="password"
                    value={passcodes[account.id] ?? ""}
                    onChange={(event) =>
                      setPasscodes((current) => ({
                        ...current,
                        [account.id]: event.target.value,
                      }))
                    }
                    placeholder="新しいパスコード（6文字以上）"
                  />
                  <ActionButton
                    onClick={() => void savePasscode(account.id)}
                    disabled={savingPasscodeId === account.id}
                  >
                    {savingPasscodeId === account.id ? "更新中..." : "パスコード変更"}
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SummaryCard({
  currentAccount,
}: {
  currentAccount: {
    id: number;
    loginId: string;
    name: string;
    role: string;
  };
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-primary)]">CURRENT ACCOUNT</p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-dark)]">{currentAccount.name}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {currentAccount.loginId} / {currentAccount.role === "admin" ? "管理者" : "通常アカウント"}
      </p>
      <p className="mt-3 text-sm leading-6 text-gray-500">
        候補者・企業・パートナー・案件は全員共通です。ここで変えるのは主に自分のカレンダーと、管理者だけが触れる共通ルールです。
      </p>
    </section>
  );
}

function SectionCard({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <Chevron expanded={open} />
      </button>

      {open && <div className="mt-5">{children}</div>}
    </section>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function ActionButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg border border-gray-300 px-5 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";
