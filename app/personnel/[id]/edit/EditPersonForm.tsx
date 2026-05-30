"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculateAge,
  CHANNELS,
  GENDERS,
  getDocumentDefinitions,
  NATIONALITIES,
  normalizeWorkHistories,
  RESIDENCE_STATUSES,
  type WorkHistoryEntry,
} from "@/lib/candidate-profile";
import { INTERVIEW_SECTIONS } from "@/lib/interview-questions";

type Person = {
  id: number;
  name: string;
  nationality: string;
  department: string | null;
  photoUrl: string | null;
  driveFolderUrl: string | null;
  residenceStatus: string;
  partnerId: number | null;
  channel: string;
  email: string | null;
  onboarding: {
    englishName: string | null;
    birthDate: string | null;
    phoneNumber: string | null;
    postalCode: string | null;
    address: string | null;
  } | null;
  resumeProfile: {
    gender: string | null;
    spouseStatus: string | null;
    childrenCount: string | null;
    visaExpiryDate: string | null;
    motivation: string | null;
    selfIntroduction: string | null;
    japanPurpose: string | null;
    currentJob: string | null;
    retirementReason: string | null;
    preferenceNote: string | null;
    japaneseLevel: string | null;
    japaneseLevelDate: string | null;
    licenseName: string | null;
    licenseExpiryDate: string | null;
    otherQualificationName: string | null;
    otherQualificationExpiryDate: string | null;
    traineeExperience: string | null;
    highSchoolName: string | null;
    highSchoolStartDate: string | null;
    highSchoolEndDate: string | null;
    universityName: string | null;
    universityStartDate: string | null;
    universityEndDate: string | null;
    workExperiences: unknown;
    certifications?: unknown;
    interviewAnswers?: unknown;
  } | null;
  documents: {
    kind: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    autoJudgeStatus: string;
    autoJudgeNote: string | null;
  }[];
};

type PartnerOption = {
  id: number;
  name: string;
};

type DocumentInput = {
  kind: string;
  label: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  autoJudgeStatus: string;
  autoJudgeNote: string;
};

const SECTION_ITEMS = [
  { id: "basic", label: "基本情報" },
  { id: "visa", label: "詳細情報" },
  { id: "placement", label: "請求" },
] as const;

type OtherQualificationEntry = { name: string; expiryDate: string };

function normalizeInterviewAnswers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}

function normalizeOtherQualifications(raw: unknown, fallbackName?: string | null, fallbackExpiry?: string | null): OtherQualificationEntry[] {
  const list: OtherQualificationEntry[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = String(obj.name ?? obj.label ?? "").trim();
        const expiryDate = String(obj.expiryDate ?? obj.date ?? obj.result ?? "").trim();
        if (name || expiryDate) list.push({ name, expiryDate });
      }
    }
  }
  if (list.length === 0 && (fallbackName || fallbackExpiry)) {
    list.push({ name: fallbackName ?? "", expiryDate: fallbackExpiry ?? "" });
  }
  return list;
}

export default function EditPersonForm({
  person,
  partners,
  customTabContent,
  placementTabContent,
}: {
  person: Person;
  partners: PartnerOption[];
  customTabContent?: React.ReactNode;
  placementTabContent?: React.ReactNode;
}) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<(typeof SECTION_ITEMS)[number]["id"]>("basic");
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({
    name: person.name,
    photoUrl: person.photoUrl ?? "",
    englishName: person.onboarding?.englishName ?? "",
    partnerId: person.partnerId ? String(person.partnerId) : "",
    nationality: person.nationality,
    residenceStatus: person.residenceStatus,
    channel: person.channel,
    phoneNumber: person.onboarding?.phoneNumber ?? "",
    gender: person.resumeProfile?.gender ?? "",
    birthDate: person.onboarding?.birthDate ?? "",
    postalCode: person.onboarding?.postalCode ?? "",
    address: person.onboarding?.address ?? "",
    spouseStatus: person.resumeProfile?.spouseStatus ?? "",
    childrenCount: person.resumeProfile?.childrenCount ?? "",
    motivation: person.resumeProfile?.motivation ?? "",
    selfIntroduction: person.resumeProfile?.selfIntroduction ?? "",
    japanPurpose: person.resumeProfile?.japanPurpose ?? "",
    currentJob: person.resumeProfile?.currentJob ?? "",
    retirementReason: person.resumeProfile?.retirementReason ?? "",
    preferenceNote: person.resumeProfile?.preferenceNote ?? "",
    visaExpiryDate: person.resumeProfile?.visaExpiryDate ?? "",
    japaneseLevel: person.resumeProfile?.japaneseLevel ?? "",
    japaneseLevelDate: person.resumeProfile?.japaneseLevelDate ?? "",
    licenseName: person.resumeProfile?.licenseName ?? "",
    licenseExpiryDate: person.resumeProfile?.licenseExpiryDate ?? "",
    otherQualificationName: person.resumeProfile?.otherQualificationName ?? "",
    otherQualificationExpiryDate: person.resumeProfile?.otherQualificationExpiryDate ?? "",
    traineeExperience: person.resumeProfile?.traineeExperience ?? "",
    highSchoolName: person.resumeProfile?.highSchoolName ?? "",
    highSchoolStartDate: person.resumeProfile?.highSchoolStartDate ?? "",
    highSchoolEndDate: person.resumeProfile?.highSchoolEndDate ?? "",
    universityName: person.resumeProfile?.universityName ?? "",
    universityStartDate: person.resumeProfile?.universityStartDate ?? "",
    universityEndDate: person.resumeProfile?.universityEndDate ?? "",
    workExperiences: withInitialWorkRow(normalizeWorkHistories(person.resumeProfile?.workExperiences)),
    otherQualifications: withInitialOtherQualRow(
      normalizeOtherQualifications(
        (person.resumeProfile as unknown as { certifications?: unknown } | null)?.certifications,
        person.resumeProfile?.otherQualificationName ?? null,
        person.resumeProfile?.otherQualificationExpiryDate ?? null,
      ),
    ),
    visaSpecificNote: person.resumeProfile?.traineeExperience ?? "",
    email: person.email ?? "",
    documents: buildInitialDocuments(person.documents, person.residenceStatus),
    interviewAnswers: normalizeInterviewAnswers(
      (person.resumeProfile as unknown as { interviewAnswers?: unknown } | null)?.interviewAnswers
    ),
  });

  const updateInterviewAnswer = (key: string, value: string) => {
    setForm((current) => ({
      ...current,
      interviewAnswers: { ...current.interviewAnswers, [key]: value },
    }));
    setDirty(true);
  };

  const age = useMemo(() => calculateAge(form.birthDate), [form.birthDate]);
  const visibleDocuments = useMemo(
    () => mergeDocumentsForStatus(form.documents, form.residenceStatus),
    [form.documents, form.residenceStatus]
  );

  const setValue = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  // 未保存のままページ離脱時に警告
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // 保存後 3 秒で「保存しました」トーストを自動非表示
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  // ⌘/Ctrl + S で保存ショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        if (!dirty || submitting) return;
        e.preventDefault();
        // 一番近い form を submit
        const forms = document.querySelectorAll("form");
        forms.forEach((f) => f.requestSubmit?.());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, submitting]);

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert("画像は3MB以下にしてください");
      return;
    }

    setUploadingPhoto(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setValue("photoUrl", dataUrl);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  const updateDocument = async (kind: string, file: File | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert("ファイルは 20MB 以下にしてください");
      return;
    }
    setUploadingKind(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/personnel/${person.id}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`Drive アップロード失敗: ${data.error ?? res.statusText}`);
        return;
      }
      setForm((current) => ({
        ...current,
        documents: upsertDocument(current.documents, {
          kind,
          label:
            getDocumentDefinitions(current.residenceStatus).find((document) => document.kind === kind)?.label ?? kind,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          mimeType: data.mimeType,
          autoJudgeStatus: "accepted",
          autoJudgeNote: "Drive アップロード",
        }),
      }));
      setDirty(true);
    } finally {
      setUploadingKind(null);
    }
  };

  const updateWorkExperience = (index: number, key: keyof WorkHistoryEntry, value: string) => {
    setForm((current) => ({
      ...current,
      workExperiences: current.workExperiences.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, [key]: value } : entry
      ),
    }));
    setDirty(true);
  };

  const addWorkExperience = () => {
    setForm((current) => ({
      ...current,
      workExperiences: [
        ...current.workExperiences,
        { companyName: "", startDate: "", endDate: "", reason: "" },
      ],
    }));
    setDirty(true);
  };

  const removeWorkExperience = (index: number) => {
    setForm((current) => ({
      ...current,
      workExperiences: current.workExperiences.filter((_, currentIndex) => currentIndex !== index),
    }));
    setDirty(true);
  };

  const updateOtherQualification = (index: number, key: keyof OtherQualificationEntry, value: string) => {
    setForm((current) => ({
      ...current,
      otherQualifications: current.otherQualifications.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, [key]: value } : entry
      ),
    }));
    setDirty(true);
  };

  const addOtherQualification = () => {
    setForm((current) => ({
      ...current,
      otherQualifications: [...current.otherQualifications, { name: "", expiryDate: "" }],
    }));
    setDirty(true);
  };

  const removeOtherQualification = (index: number) => {
    setForm((current) => ({
      ...current,
      otherQualifications: current.otherQualifications.filter((_, currentIndex) => currentIndex !== index),
    }));
    setDirty(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      alert("カタカナ名を入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const cleanedOtherQualifications = form.otherQualifications.filter(
        (entry) => entry.name.trim() || entry.expiryDate.trim()
      );
      const firstOther = cleanedOtherQualifications[0];
      const response = await fetch(`/api/personnel/${person.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          partnerId: form.partnerId ? Number(form.partnerId) : null,
          workExperiences: form.workExperiences.filter(
            (entry) => entry.companyName || entry.startDate || entry.endDate || entry.reason
          ),
          otherQualifications: cleanedOtherQualifications,
          // 互換用: 最初の1件は単一フィールドにも保存
          otherQualificationName: firstOther?.name || null,
          otherQualificationExpiryDate: firstOther?.expiryDate || null,
          // 在留資格固有メモは traineeExperience に保存 (互換維持)
          traineeExperience: form.visaSpecificNote || null,
          documents: visibleDocuments,
          interviewAnswers: form.interviewAnswers,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(`更新失敗: ${result.error}`);
        return;
      }
      setDirty(false);
      setSavedAt(Date.now());
      // 一覧へ遷移せず、現在のページに残ったまま最新データを再取得
      router.refresh();
    } catch {
      alert("更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`「${person.name}」を削除しますか？`)) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/personnel/${person.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(`削除失敗: ${result.error}`);
        return;
      }
      router.push("/personnel");
    } catch {
      alert("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-3xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-3">
        <div className="grid gap-2 md:grid-cols-3">
          {SECTION_ITEMS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                activeSection === section.id
                  ? "bg-[var(--color-primary)] text-white shadow-sm"
                  : "bg-white text-[var(--color-text-dark)] hover:bg-white/80"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>


      {activeSection === "basic" ? (
        <section className="space-y-5 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="英語名">
              <input className={INPUT} value={form.englishName} onChange={(event) => setValue("englishName", event.target.value)} placeholder="NGUYEN VAN AN" />
            </Field>
            <Field label="カタカナ名 *">
              <input className={INPUT} value={form.name} onChange={(event) => setValue("name", event.target.value)} placeholder="グエン ヴァン アン" />
            </Field>
            <Field label="紹介パートナー">
              <select className={INPUT} value={form.partnerId} onChange={(event) => setValue("partnerId", event.target.value)}>
                <option value="">未設定</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="国籍">
              <select className={INPUT} value={form.nationality} onChange={(event) => setValue("nationality", event.target.value)}>
                {NATIONALITIES.map((nationality) => (
                  <option key={nationality}>{nationality}</option>
                ))}
              </select>
            </Field>
            <Field label="携帯番号">
              <input className={INPUT} value={form.phoneNumber} onChange={(event) => setValue("phoneNumber", event.target.value)} />
            </Field>
            <Field label="性別">
              <select className={INPUT} value={form.gender} onChange={(event) => setValue("gender", event.target.value)}>
                <option value="">未設定</option>
                {GENDERS.map((gender) => (
                  <option key={gender}>{gender}</option>
                ))}
              </select>
            </Field>
            <Field label="生年月日">
              <input className={INPUT} type="date" value={form.birthDate} onChange={(event) => setValue("birthDate", event.target.value)} />
            </Field>
            <Field label="年齢">
              <input className={`${INPUT} bg-gray-50`} value={age} readOnly placeholder="自動計算" />
            </Field>
            <Field label="住所" className="md:col-span-2">
              <textarea className={`${INPUT} min-h-28`} value={form.address} onChange={(event) => setValue("address", event.target.value)} />
            </Field>
            <Field label="郵便番号">
              <input className={INPUT} value={form.postalCode} onChange={(event) => setValue("postalCode", event.target.value)} />
            </Field>
            <Field label="配偶者">
              <input className={INPUT} value={form.spouseStatus} onChange={(event) => setValue("spouseStatus", event.target.value)} placeholder="有 / 無" />
            </Field>
            <Field label="子供">
              <input className={INPUT} value={form.childrenCount} onChange={(event) => setValue("childrenCount", event.target.value)} placeholder="0" />
            </Field>
            {/* 志望動機/自己紹介/来日目的/現在の仕事/退職理由 は下の「事前質問」セクションに統合 */}
          </div>

          {/* 事前質問 (面接前ヒアリング) — 配偶者・子供以降の島セクション */}
          {INTERVIEW_SECTIONS.map((section, sectionIdx) => (
            <div key={sectionIdx} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-base font-semibold text-[var(--color-text-dark)]">
                {section.title}
              </p>
              {section.description ? (
                <p className="mt-1 text-xs text-gray-500">{section.description}</p>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {section.questions.map((q) => {
                  const value = q.existingField
                    ? (form[q.existingField] as string)
                    : form.interviewAnswers[q.jsonKey ?? q.key] ?? "";
                  const onChange = (next: string) => {
                    if (q.existingField) {
                      setValue(q.existingField, next as never);
                    } else {
                      updateInterviewAnswer(q.jsonKey ?? q.key, next);
                    }
                  };
                  return (
                    <Field
                      key={q.key}
                      label={q.question}
                      className={q.type === "textarea" ? "md:col-span-2" : ""}
                    >
                      {q.type === "textarea" ? (
                        <textarea
                          className={`${INPUT} min-h-20`}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder={q.hint}
                        />
                      ) : q.type === "select" && q.options ? (
                        <select
                          className={INPUT}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                        >
                          <option value="">未設定</option>
                          {q.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={INPUT}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder={q.hint}
                        />
                      )}
                      {q.adminNote ? (
                        <p className="mt-1 text-[10px] text-gray-400">{q.adminNote}</p>
                      ) : null}
                    </Field>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-gray-200 bg-[var(--color-light)] p-5">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">連絡手段</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="主な連絡手段">
                <select className={INPUT} value={form.channel} onChange={(event) => setValue("channel", event.target.value)}>
                  {CHANNELS.map((channel) => (
                    <option key={channel.value} value={channel.value}>
                      {channel.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="メールアドレス">
                <input className={INPUT} type="email" value={form.email} onChange={(event) => setValue("email", event.target.value)} placeholder="example@email.com" />
              </Field>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "visa" ? (
        <section className="space-y-5">
          {/* 島1: 在留資格・免許 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-[var(--color-text-dark)]">在留資格・免許</p>
            <p className="mt-1 text-sm text-gray-500">在留資格の基本情報と、保有する免許・資格を記録します。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="現在の在留資格">
                <select className={INPUT} value={form.residenceStatus} onChange={(event) => setValue("residenceStatus", event.target.value)}>
                  {/* 既存 DB に標準リスト外の値があれば、その値も option として表示 */}
                  {form.residenceStatus && !RESIDENCE_STATUSES.includes(form.residenceStatus) ? (
                    <option value={form.residenceStatus}>{form.residenceStatus}</option>
                  ) : null}
                  {RESIDENCE_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Field label="在留資格の有効期限">
                <input className={INPUT} type="date" value={form.visaExpiryDate} onChange={(event) => setValue("visaExpiryDate", event.target.value)} />
              </Field>
              <Field label="日本語検定">
                <input className={INPUT} value={form.japaneseLevel} onChange={(event) => setValue("japaneseLevel", event.target.value)} placeholder="JLPT N3" />
              </Field>
              <Field label="取得日">
                <input className={INPUT} type="date" value={form.japaneseLevelDate} onChange={(event) => setValue("japaneseLevelDate", event.target.value)} />
              </Field>
              <Field label="免許">
                <input className={INPUT} value={form.licenseName} onChange={(event) => setValue("licenseName", event.target.value)} placeholder="普通自動車第一種免許" />
              </Field>
              <Field label="免許の有効期限">
                <input className={INPUT} type="date" value={form.licenseExpiryDate} onChange={(event) => setValue("licenseExpiryDate", event.target.value)} />
              </Field>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">その他の資格</p>
                  <p className="mt-1 text-xs text-gray-500">複数の資格を行ごとに追加できます。</p>
                </div>
                <button
                  type="button"
                  onClick={addOtherQualification}
                  className="rounded-lg border border-[var(--color-secondary)] bg-white px-3 py-1.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-light)]"
                >
                  + 行を追加
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {form.otherQualifications.map((entry, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-white bg-white p-3 md:grid-cols-[2fr_1fr_auto]">
                    <Field label={index === 0 ? "資格名" : ""}>
                      <input
                        className={INPUT}
                        value={entry.name}
                        onChange={(event) => updateOtherQualification(index, "name", event.target.value)}
                        placeholder="介護初任者研修"
                      />
                    </Field>
                    <Field label={index === 0 ? "有効期限 (任意)" : ""}>
                      <input
                        className={INPUT}
                        type="date"
                        value={entry.expiryDate}
                        onChange={(event) => updateOtherQualification(index, "expiryDate", event.target.value)}
                      />
                    </Field>
                    {form.otherQualifications.length > 1 ? (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeOtherQualification(index)}
                          className="rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-400 hover:border-red-300 hover:text-red-500"
                        >
                          削除
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 島2: 学歴・職歴 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-base font-semibold text-[var(--color-text-dark)]">学歴・職歴</p>
            <p className="mt-1 text-sm text-gray-500">高校・大学および職歴をまとめて管理します。</p>

            <div className="mt-4 grid gap-4 rounded-2xl border border-gray-200 bg-[var(--color-light)] p-5 md:grid-cols-3">
              <Field label="高校名" className="md:col-span-3">
                <input className={INPUT} value={form.highSchoolName} onChange={(event) => setValue("highSchoolName", event.target.value)} />
              </Field>
              <Field label="高校入学年月日">
                <input className={INPUT} type="date" value={form.highSchoolStartDate} onChange={(event) => setValue("highSchoolStartDate", event.target.value)} />
              </Field>
              <Field label="高校卒業年月日">
                <input className={INPUT} type="date" value={form.highSchoolEndDate} onChange={(event) => setValue("highSchoolEndDate", event.target.value)} />
              </Field>
              <div />
              <Field label="大学名" className="md:col-span-3">
                <input className={INPUT} value={form.universityName} onChange={(event) => setValue("universityName", event.target.value)} />
              </Field>
              <Field label="大学入学年月日">
                <input className={INPUT} type="date" value={form.universityStartDate} onChange={(event) => setValue("universityStartDate", event.target.value)} />
              </Field>
              <Field label="大学卒業年月日">
                <input className={INPUT} type="date" value={form.universityEndDate} onChange={(event) => setValue("universityEndDate", event.target.value)} />
              </Field>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-[var(--color-light)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-dark)]">職歴</p>
                  <p className="mt-1 text-xs text-gray-500">会社が複数ある場合は行を追加して管理できます。</p>
                </div>
                <button
                  type="button"
                  onClick={addWorkExperience}
                  className="rounded-lg border border-[var(--color-secondary)] bg-white px-4 py-2 text-sm text-[var(--color-primary)]"
                >
                  + 行を追加
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {form.workExperiences.map((entry, index) => (
                  <div key={index} className="rounded-2xl border border-white bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="会社名" className="md:col-span-2">
                        <input className={INPUT} value={entry.companyName} onChange={(event) => updateWorkExperience(index, "companyName", event.target.value)} />
                      </Field>
                      <Field label="入社年月日">
                        <input className={INPUT} type="date" value={entry.startDate} onChange={(event) => updateWorkExperience(index, "startDate", event.target.value)} />
                      </Field>
                      <Field label="退社年月日">
                        <input className={INPUT} type="date" value={entry.endDate} onChange={(event) => updateWorkExperience(index, "endDate", event.target.value)} />
                      </Field>
                      <Field label="退社理由" className="md:col-span-2">
                        <textarea className={`${INPUT} min-h-24`} value={entry.reason} onChange={(event) => updateWorkExperience(index, "reason", event.target.value)} />
                      </Field>
                    </div>
                    {form.workExperiences.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeWorkExperience(index)}
                        className="mt-3 text-sm text-red-500 hover:underline"
                      >
                        この行を削除
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 島3: 在留資格別 (「不明」「持っていない」「空」のときは非表示) */}
          {!["不明", "持っていない", ""].includes(form.residenceStatus) && (() => {
            const cfg = visaSpecificConfig(form.residenceStatus);
            return (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-[var(--color-text-dark)]">{cfg.title}</p>
                  <span className="rounded-full bg-[var(--color-light)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                    在留資格別
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{cfg.description}</p>
                <div className="mt-4">
                  <Field label={cfg.fieldLabel}>
                    <textarea
                      className={`${INPUT} min-h-24`}
                      value={form.visaSpecificNote}
                      onChange={(event) => setValue("visaSpecificNote", event.target.value)}
                      placeholder={cfg.placeholder}
                    />
                  </Field>
                </div>

                {visibleDocuments.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">必要書類</p>
                    {visibleDocuments.map((document) => {
                      const driveUrl = document.fileUrl?.startsWith("http") ? document.fileUrl : null;
                      const fileId = driveUrl ? extractDriveFileId(driveUrl) : null;
                      const isUploading = uploadingKind === document.kind;
                      return (
                        <div
                          key={document.kind}
                          className="rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[var(--color-text-dark)]">{document.label}</p>
                              <p className="mt-1 text-xs text-gray-500 truncate">
                                {document.fileName ? `現在のファイル: ${document.fileName}` : "まだ提出されていません"}
                              </p>
                              {driveUrl ? (
                                <a
                                  href={driveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                                >
                                  <span>Drive で開く</span>
                                  <span aria-hidden>↗</span>
                                </a>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] border border-[var(--color-secondary)] shrink-0">
                              {document.autoJudgeStatus === "accepted" ? "確認済み" : "要確認"}
                            </span>
                          </div>
                          {fileId ? (
                            <DocumentPreview fileId={fileId} mimeType={document.mimeType} fileUrl={driveUrl ?? ""} />
                          ) : null}
                          <label
                            className={`inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-medium text-white ${
                              isUploading
                                ? "bg-gray-400"
                                : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
                            }`}
                          >
                            {isUploading
                              ? "Drive にアップロード中..."
                              : document.fileName
                                ? "ファイルを差し替え"
                                : "ファイルをアップロード"}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(event) => void updateDocument(document.kind, event.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {customTabContent ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {customTabContent}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSection === "placement" ? (
        <section className="space-y-5">
          {placementTabContent ?? (
            <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
              内定後の情報表示が未設定です
            </p>
          )}
        </section>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          {activeSection === "basic" || activeSection === "visa" ? (
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {submitting ? "保存中..." : "保存"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50"
          >
            戻る
          </button>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm text-red-500 hover:underline disabled:opacity-50"
        >
          {deleting ? "削除中..." : "削除"}
        </button>
      </div>

      {/* 保存しましたトースト (3 秒で消える) */}
      {savedAt !== null && !dirty ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
          <div className="flex items-center gap-2 rounded-full border border-[#16A34A]/30 bg-[#F0FDF4] px-5 py-3 text-sm font-medium text-[#15803D] shadow-xl">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            保存しました
          </div>
        </div>
      ) : null}

      {/* 未保存の変更があるときに画面下から浮上してくる固定保存バー */}
      {dirty && (activeSection === "basic" || activeSection === "visa") ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
          <div className="pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-full border border-[var(--color-primary)]/30 bg-white/95 px-5 py-3 shadow-2xl ring-1 ring-black/5 backdrop-blur transition-all">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[#F59E0B]" />
              <span className="font-medium text-[var(--color-text-dark)]">未保存の変更があります</span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {submitting ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]";

function AvatarPreview({ name, photoUrl }: { name: string; photoUrl: string }) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name || "人材写真"}
        width={96}
        height={96}
        unoptimized
        className="h-24 w-24 rounded-2xl border border-gray-200 object-cover shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-3xl font-bold text-white shadow-sm">
      {(name.trim()[0] ?? "人").toUpperCase()}
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildInitialDocuments(documents: Person["documents"], residenceStatus: string): DocumentInput[] {
  return getDocumentDefinitions(residenceStatus).map((definition) => {
    const current = documents.find((document) => document.kind === definition.kind);
    return {
      kind: definition.kind,
      label: definition.label,
      fileName: current?.fileName ?? "",
      fileUrl: current?.fileUrl ?? "",
      mimeType: current?.mimeType ?? "",
      autoJudgeStatus: current?.autoJudgeStatus ?? "pending",
      autoJudgeNote: current?.autoJudgeNote ?? "",
    };
  });
}

function mergeDocumentsForStatus(documents: DocumentInput[], residenceStatus: string) {
  return getDocumentDefinitions(residenceStatus).map((definition) => {
    const current = documents.find((document) => document.kind === definition.kind);
    return current ?? {
      kind: definition.kind,
      label: definition.label,
      fileName: "",
      fileUrl: "",
      mimeType: "",
      autoJudgeStatus: "pending",
      autoJudgeNote: "",
    };
  });
}

function withInitialWorkRow(entries: WorkHistoryEntry[]) {
  return entries.length > 0 ? entries : [{ companyName: "", startDate: "", endDate: "", reason: "" }];
}

function withInitialOtherQualRow(entries: OtherQualificationEntry[]) {
  return entries.length > 0 ? entries : [{ name: "", expiryDate: "" }];
}

function visaSpecificConfig(residenceStatus: string): {
  title: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
} {
  if (residenceStatus.includes("特定技能")) {
    return {
      title: residenceStatus,
      description: "技能検定や評価試験の合格情報、特定技能としての従事内容を記載します。",
      fieldLabel: "技能検定 / 評価試験",
      placeholder: "例: 介護技能評価試験 合格 (2024-03)",
    };
  }
  if (residenceStatus.includes("技能実習")) {
    return {
      title: residenceStatus,
      description: "技能実習の職種・経験年数や評価試験の取得状況を記載します。",
      fieldLabel: "技能実習 経験",
      placeholder: "例: 介護 1号→2号 / 3年経験あり",
    };
  }
  if (residenceStatus.includes("技術") || residenceStatus.includes("人文") || residenceStatus.includes("国際")) {
    return {
      title: residenceStatus,
      description: "学位や専門分野、業務内容との一致点など、在留資格の根拠となる情報を記載します。",
      fieldLabel: "業務内容 / 専門分野",
      placeholder: "例: 機械工学専攻 / 設計補助業務",
    };
  }
  return {
    title: residenceStatus || "在留資格情報",
    description: "現在の在留資格に関連する補足情報を自由に記載します。",
    fieldLabel: "在留資格に関する補足",
    placeholder: "資格名や経験など",
  };
}

function upsertDocument(documents: DocumentInput[], nextDocument: DocumentInput) {
  const exists = documents.some((document) => document.kind === nextDocument.kind);
  if (!exists) return [...documents, nextDocument];
  return documents.map((document) => (document.kind === nextDocument.kind ? nextDocument : document));
}

function extractDriveFileId(url: string): string | null {
  // 例: https://drive.google.com/file/d/{id}/view, https://drive.google.com/open?id={id}
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function DocumentPreview({
  fileId,
  mimeType,
  fileUrl,
}: {
  fileId: string;
  mimeType: string | null;
  fileUrl: string;
}) {
  // 画像: thumbnail (Drive のサムネ) を表示
  // PDF / その他: iframe で /preview を埋め込み (Drive 側で公開設定 or 共有が必要な場合は "Drive で開く" にフォールバック)
  const isImage = (mimeType ?? "").startsWith("image/");
  if (isImage) {
    const src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border border-gray-200 bg-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="プレビュー" className="h-40 w-full object-contain" loading="lazy" />
      </a>
    );
  }
  // PDF/Office 等
  const src = `https://drive.google.com/file/d/${fileId}/preview`;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <iframe
        src={src}
        title="ドキュメントプレビュー"
        className="h-64 w-full"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

