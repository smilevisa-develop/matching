"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  calculateAge,
  GENDERS,
  getDocumentDefinitions,
  NATIONALITIES,
  normalizeWorkHistories,
  RESIDENCE_STATUSES,
  type WorkHistoryEntry,
} from "@/lib/candidate-profile";

type DocumentInput = {
  kind: string;
  label: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
};

export default function OnboardingForm({
  personId,
  personName,
  personPhotoUrl,
  initialData,
}: {
  personId: number;
  personName: string;
  personPhotoUrl: string | null;
  initialData: {
    englishName: string;
    birthDate: string;
    phoneNumber: string;
    postalCode: string;
    address: string;
    nationality: string;
    residenceStatus: string;
    gender: string;
    spouseStatus: string;
    childrenCount: string;
    motivation: string;
    selfIntroduction: string;
    japanPurpose: string;
    currentJob: string;
    retirementReason: string;
    preferenceNote: string;
    visaExpiryDate: string;
    japaneseLevel: string;
    japaneseLevelDate: string;
    licenseName: string;
    licenseExpiryDate: string;
    otherQualificationName: string;
    otherQualificationExpiryDate: string;
    traineeExperience: string;
    highSchoolName: string;
    highSchoolStartDate: string;
    highSchoolEndDate: string;
    universityName: string;
    universityStartDate: string;
    universityEndDate: string;
    workExperiences: unknown;
    photoUrl: string;
    documents: DocumentInput[];
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: personName,
    englishName: initialData.englishName,
    nationality: initialData.nationality,
    residenceStatus: initialData.residenceStatus,
    phoneNumber: initialData.phoneNumber,
    gender: initialData.gender,
    birthDate: initialData.birthDate,
    postalCode: initialData.postalCode,
    address: initialData.address,
    spouseStatus: initialData.spouseStatus,
    childrenCount: initialData.childrenCount,
    motivation: initialData.motivation,
    selfIntroduction: initialData.selfIntroduction,
    japanPurpose: initialData.japanPurpose,
    currentJob: initialData.currentJob,
    retirementReason: initialData.retirementReason,
    preferenceNote: initialData.preferenceNote,
    visaExpiryDate: initialData.visaExpiryDate,
    japaneseLevel: initialData.japaneseLevel,
    japaneseLevelDate: initialData.japaneseLevelDate,
    licenseName: initialData.licenseName,
    licenseExpiryDate: initialData.licenseExpiryDate,
    otherQualificationName: initialData.otherQualificationName,
    otherQualificationExpiryDate: initialData.otherQualificationExpiryDate,
    traineeExperience: initialData.traineeExperience,
    highSchoolName: initialData.highSchoolName,
    highSchoolStartDate: initialData.highSchoolStartDate,
    highSchoolEndDate: initialData.highSchoolEndDate,
    universityName: initialData.universityName,
    universityStartDate: initialData.universityStartDate,
    universityEndDate: initialData.universityEndDate,
    workExperiences: withInitialWorkRow(normalizeWorkHistories(initialData.workExperiences)),
    photoUrl: initialData.photoUrl || personPhotoUrl || "",
    documents: initialData.documents,
  });

  const age = useMemo(() => calculateAge(form.birthDate), [form.birthDate]);
  const visibleDocuments = useMemo(
    () => mergeDocuments(form.documents, form.residenceStatus),
    [form.documents, form.residenceStatus]
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateDocument = async (kind: string, file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("ファイルは5MB以下にしてください");
      return;
    }

    const fileUrl = await readFileAsDataUrl(file);

    setForm((current) => ({
      ...current,
      documents: upsertDocument(current.documents, {
        kind,
        label: getDocumentDefinitions(current.residenceStatus).find((document) => document.kind === kind)?.label ?? kind,
        fileName: file.name,
        fileUrl,
        mimeType: file.type,
      }),
    }));
  };

  const updatePhoto = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("顔写真は画像を選択してください");
      return;
    }
    const photoUrl = await readFileAsDataUrl(file);
    set("photoUrl", photoUrl);
  };

  const updateWorkExperience = (index: number, key: keyof WorkHistoryEntry, value: string) => {
    setForm((current) => ({
      ...current,
      workExperiences: current.workExperiences.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, [key]: value } : entry
      ),
    }));
  };

  const addWorkExperience = () => {
    setForm((current) => ({
      ...current,
      workExperiences: [...current.workExperiences, { companyName: "", startDate: "", endDate: "", content: "", reason: "" }],
    }));
  };

  const goNext = () => {
    if (step === 0 && (!form.name.trim() || !form.birthDate.trim() || !form.address.trim())) {
      alert("カタカナ名・生年月日・住所を入力してください");
      return;
    }
    setStep((current) => Math.min(current + 1, 2));
  };

  const handleSubmit = async () => {
    const missingRequiredDocument = visibleDocuments.some((document) => !document.fileUrl);
    if (missingRequiredDocument) {
      alert("必要書類をアップロードしてください");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${personId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          documents: visibleDocuments,
          workExperiences: form.workExperiences.filter(
            (entry) => entry.companyName || entry.startDate || entry.endDate || entry.content || entry.reason
          ),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`保存失敗: ${data.error}`);
        return;
      }
      alert("初期登録を送信しました");
      router.push(`/portal/${personId}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold text-[var(--color-text-dark)]">登録ステップ</p>
        <div className="mt-4 flex items-center gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-1 items-center gap-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                index <= step ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-secondary)] text-[var(--color-primary)]"
              }`}>
                {index + 1}
              </div>
              {index < 2 && (
                <div className={`h-1 flex-1 rounded-full ${index < step ? "bg-[var(--color-primary)]" : "bg-[var(--color-secondary)]"}`} />
              )}
            </div>
          ))}
        </div>
      </section>

      {step === 0 ? (
        <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">基本情報</p>
          <div className="mt-4 grid gap-4">
            <PhotoField name={form.name} photoUrl={form.photoUrl} onChange={updatePhoto} />
            <Field label="英語名">
              <input className={INPUT} value={form.englishName} onChange={(event) => set("englishName", event.target.value)} placeholder="NGUYEN VAN AN" />
            </Field>
            <Field label="カタカナ名 *">
              <input className={INPUT} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="グエン ヴァン アン" />
            </Field>
            <Field label="国籍">
              <select className={INPUT} value={form.nationality} onChange={(event) => set("nationality", event.target.value)}>
                {NATIONALITIES.map((nationality) => (
                  <option key={nationality}>{nationality}</option>
                ))}
              </select>
            </Field>
            <Field label="携帯番号">
              <input className={INPUT} value={form.phoneNumber} onChange={(event) => set("phoneNumber", event.target.value)} />
            </Field>
            <Field label="性別">
              <select className={INPUT} value={form.gender} onChange={(event) => set("gender", event.target.value)}>
                <option value="">未設定</option>
                {GENDERS.map((gender) => (
                  <option key={gender}>{gender}</option>
                ))}
              </select>
            </Field>
            <Field label="生年月日 *">
              <input className={INPUT} type="date" value={form.birthDate} onChange={(event) => set("birthDate", event.target.value)} />
            </Field>
            <Field label="年齢">
              <input className={`${INPUT} bg-gray-50`} value={age} readOnly placeholder="自動計算" />
            </Field>
            <Field label="住所 *">
              <textarea className={`${INPUT} min-h-28`} value={form.address} onChange={(event) => set("address", event.target.value)} />
            </Field>
            <Field label="郵便番号">
              <input className={INPUT} value={form.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
            </Field>
            <Field label="配偶者">
              <input className={INPUT} value={form.spouseStatus} onChange={(event) => set("spouseStatus", event.target.value)} />
            </Field>
            <Field label="子供">
              <input className={INPUT} value={form.childrenCount} onChange={(event) => set("childrenCount", event.target.value)} />
            </Field>
            <Field label="志望動機">
              <textarea className={`${INPUT} min-h-24`} value={form.motivation} onChange={(event) => set("motivation", event.target.value)} />
            </Field>
            <Field label="自己紹介">
              <textarea className={`${INPUT} min-h-24`} value={form.selfIntroduction} onChange={(event) => set("selfIntroduction", event.target.value)} />
            </Field>
            <Field label="来日目的">
              <textarea className={`${INPUT} min-h-24`} value={form.japanPurpose} onChange={(event) => set("japanPurpose", event.target.value)} />
            </Field>
            <Field label="現在の仕事">
              <textarea className={`${INPUT} min-h-24`} value={form.currentJob} onChange={(event) => set("currentJob", event.target.value)} />
            </Field>
            <Field label="退職理由">
              <textarea className={`${INPUT} min-h-24`} value={form.retirementReason} onChange={(event) => set("retirementReason", event.target.value)} />
            </Field>
            <Field label="本人希望記入欄">
              <textarea className={`${INPUT} min-h-24`} value={form.preferenceNote} onChange={(event) => set("preferenceNote", event.target.value)} />
            </Field>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">資格・学歴</p>
          <div className="mt-4 space-y-4">
            <Field label="現在の在留資格">
              <select className={INPUT} value={form.residenceStatus} onChange={(event) => set("residenceStatus", event.target.value)}>
                {RESIDENCE_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="在留資格の有効期限">
              <input className={INPUT} type="date" value={form.visaExpiryDate} onChange={(event) => set("visaExpiryDate", event.target.value)} />
            </Field>
            <Field label="日本語検定">
              <input className={INPUT} value={form.japaneseLevel} onChange={(event) => set("japaneseLevel", event.target.value)} />
            </Field>
            <Field label="取得日">
              <input className={INPUT} type="date" value={form.japaneseLevelDate} onChange={(event) => set("japaneseLevelDate", event.target.value)} />
            </Field>
            <Field label="免許">
              <input className={INPUT} value={form.licenseName} onChange={(event) => set("licenseName", event.target.value)} />
            </Field>
            <Field label="免許の有効期限">
              <input className={INPUT} type="date" value={form.licenseExpiryDate} onChange={(event) => set("licenseExpiryDate", event.target.value)} />
            </Field>
            <Field label="その他の資格">
              <input className={INPUT} value={form.otherQualificationName} onChange={(event) => set("otherQualificationName", event.target.value)} />
            </Field>
            <Field label="その他資格の有効期限">
              <input className={INPUT} type="date" value={form.otherQualificationExpiryDate} onChange={(event) => set("otherQualificationExpiryDate", event.target.value)} />
            </Field>
            <Field label="実習経験の有無">
              <input className={INPUT} value={form.traineeExperience} onChange={(event) => set("traineeExperience", event.target.value)} />
            </Field>
            <Field label="高校名">
              <input className={INPUT} value={form.highSchoolName} onChange={(event) => set("highSchoolName", event.target.value)} />
            </Field>
            <Field label="高校入学年月日">
              <input className={INPUT} type="date" value={form.highSchoolStartDate} onChange={(event) => set("highSchoolStartDate", event.target.value)} />
            </Field>
            <Field label="高校卒業年月日">
              <input className={INPUT} type="date" value={form.highSchoolEndDate} onChange={(event) => set("highSchoolEndDate", event.target.value)} />
            </Field>
            <Field label="大学名">
              <input className={INPUT} value={form.universityName} onChange={(event) => set("universityName", event.target.value)} />
            </Field>
            <Field label="大学入学年月日">
              <input className={INPUT} type="date" value={form.universityStartDate} onChange={(event) => set("universityStartDate", event.target.value)} />
            </Field>
            <Field label="大学卒業年月日">
              <input className={INPUT} type="date" value={form.universityEndDate} onChange={(event) => set("universityEndDate", event.target.value)} />
            </Field>
            <div className="rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">職歴</p>
                <button type="button" onClick={addWorkExperience} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-primary)]">
                  + 行を追加
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {form.workExperiences.map((entry, index) => (
                  <div key={`${index}-${entry.companyName}`} className="rounded-2xl border border-white bg-white p-3">
                    <div className="space-y-3">
                      <Field label="会社名">
                        <input className={INPUT} value={entry.companyName} onChange={(event) => updateWorkExperience(index, "companyName", event.target.value)} />
                      </Field>
                      <Field label="入社年月日">
                        <input className={INPUT} type="date" value={entry.startDate} onChange={(event) => updateWorkExperience(index, "startDate", event.target.value)} />
                      </Field>
                      <Field label="退社年月日">
                        <input className={INPUT} type="date" value={entry.endDate} onChange={(event) => updateWorkExperience(index, "endDate", event.target.value)} />
                      </Field>
                      <Field label="仕事内容">
                        <textarea className={`${INPUT} min-h-20`} value={entry.content} onChange={(event) => updateWorkExperience(index, "content", event.target.value)} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">提出書類</p>
            <p className="mt-2 text-xs text-[#64748B]">
              在留資格に応じて必要な書類を提出してください。現在の在留資格: {form.residenceStatus}
            </p>
          </section>

          {visibleDocuments.map((document) => (
            <section
              key={document.kind}
              className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]"
            >
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">{document.label}</p>
              <p className="mt-2 text-xs text-[#64748B]">画像またはPDFで提出できます。</p>
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] p-4">
                <p className="text-sm text-[var(--color-text-dark)]">
                  {document.fileName ? `選択中: ${document.fileName}` : "まだ提出されていません"}
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">
                  ファイルを選択
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(event) => void updateDocument(document.kind, event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </section>
          ))}
        </section>
      ) : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(current - 1, 0))}
            className="flex-1 rounded-2xl border border-[var(--color-secondary)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-primary)]"
          >
            戻る
          </button>
        ) : null}

        {step < 2 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)]"
          >
            次へ
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex-1 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)] disabled:opacity-50"
          >
            {submitting ? "送信中..." : "初期登録を送信"}
          </button>
        )}
      </div>
    </div>
  );
}

function PhotoField({
  name,
  photoUrl,
  onChange,
}: {
  name: string;
  photoUrl: string;
  onChange: (file: File | null) => Promise<void>;
}) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
      <p className="text-sm font-semibold text-[var(--color-text-dark)]">顔写真</p>
      <div className="mt-4 flex items-center gap-4">
        <AvatarPreview name={name} photoUrl={photoUrl} />
        <label className="inline-flex cursor-pointer items-center rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">
          写真を選択
          <input type="file" accept="image/*" className="hidden" onChange={(event) => void onChange(event.target.files?.[0] ?? null)} />
        </label>
      </div>
    </section>
  );
}

function AvatarPreview({ name, photoUrl }: { name: string; photoUrl: string }) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name || "顔写真"}
        width={88}
        height={88}
        unoptimized
        className="h-22 w-22 rounded-3xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-[88px] w-[88px] items-center justify-center rounded-3xl bg-[var(--color-primary)] text-3xl font-bold text-white">
      {name[0] ?? "人"}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--color-text-dark)]">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full rounded-2xl border border-[var(--color-secondary)] bg-[var(--color-light)] px-4 py-3 text-sm text-[var(--color-text-dark)] outline-none";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function mergeDocuments(documents: DocumentInput[], residenceStatus: string) {
  return getDocumentDefinitions(residenceStatus).map((definition) => {
    const current = documents.find((document) => document.kind === definition.kind);
    return current ?? {
      kind: definition.kind,
      label: definition.label,
      fileName: "",
      fileUrl: "",
      mimeType: "",
    };
  });
}

function withInitialWorkRow(entries: WorkHistoryEntry[]) {
  return entries.length > 0 ? entries : [{ companyName: "", startDate: "", endDate: "", content: "", reason: "" }];
}

function upsertDocument(documents: DocumentInput[], nextDocument: DocumentInput) {
  const exists = documents.some((document) => document.kind === nextDocument.kind);
  if (!exists) return [...documents, nextDocument];
  return documents.map((document) => (document.kind === nextDocument.kind ? nextDocument : document));
}
