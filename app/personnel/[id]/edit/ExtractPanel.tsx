"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import CloseButton from "@/app/components/CloseButton";
import IconTooltip from "./IconTooltip";
import { ALL_DOCUMENT_KINDS, getDocumentKindLabel } from "@/lib/file-classifier";

type UploadedFileWithKind = {
  fileName: string;
  originalFileName?: string;
  fileUrl: string;
  fileId?: string | null;
  mimeType?: string;
  suggestedKind?: string;
  suggestedLabel?: string;
  confidence?: "high" | "medium" | "low";
  source?: "filename" | "ai" | "unknown";
};

type IncomingFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export type ExtractedCandidate = {
  name?: string;
  englishName?: string;
  nationality?: string;
  residenceStatus?: string;
  visaExpiryDate?: string;
  birthDate?: string;
  gender?: string;
  phoneNumber?: string;
  email?: string;
  postalCode?: string;
  address?: string;
  spouseStatus?: string;
  childrenCount?: string;
  japaneseLevel?: string;
  japaneseLevelDate?: string;
  licenseName?: string;
  licenseExpiryDate?: string;
  otherQualificationName?: string;
  otherQualificationExpiryDate?: string;
  traineeExperience?: string;
  highSchoolName?: string;
  highSchoolStartDate?: string;
  highSchoolEndDate?: string;
  universityName?: string;
  universityStartDate?: string;
  universityEndDate?: string;
  motivation?: string;
  selfIntroduction?: string;
  japanPurpose?: string;
  currentJob?: string;
  retirementReason?: string;
  preferenceNote?: string;
  workExperiences?: { companyName?: string; startDate?: string; endDate?: string; reason?: string }[];
  _warnings?: string[];
};

type FieldKey = Exclude<keyof ExtractedCandidate, "workExperiences" | "_warnings">;

const FIELD_LABELS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "カナ名" },
  { key: "englishName", label: "英語名" },
  { key: "nationality", label: "国籍" },
  { key: "residenceStatus", label: "在留資格" },
  { key: "visaExpiryDate", label: "在留資格の有効期限" },
  { key: "birthDate", label: "生年月日" },
  { key: "gender", label: "性別" },
  { key: "phoneNumber", label: "携帯番号" },
  { key: "email", label: "メール" },
  { key: "postalCode", label: "郵便番号" },
  { key: "address", label: "住所" },
  { key: "spouseStatus", label: "配偶者" },
  { key: "childrenCount", label: "子供" },
  { key: "japaneseLevel", label: "日本語検定" },
  { key: "japaneseLevelDate", label: "日本語検定取得日" },
  { key: "licenseName", label: "免許" },
  { key: "licenseExpiryDate", label: "免許の有効期限" },
  { key: "otherQualificationName", label: "その他の資格" },
  { key: "otherQualificationExpiryDate", label: "その他資格の有効期限" },
  { key: "traineeExperience", label: "実習経験" },
  { key: "highSchoolName", label: "高校名" },
  { key: "highSchoolStartDate", label: "高校入学" },
  { key: "highSchoolEndDate", label: "高校卒業" },
  { key: "universityName", label: "大学名" },
  { key: "universityStartDate", label: "大学入学" },
  { key: "universityEndDate", label: "大学卒業" },
  { key: "motivation", label: "志望動機" },
  { key: "selfIntroduction", label: "自己紹介" },
  { key: "japanPurpose", label: "来日目的" },
  { key: "currentJob", label: "現在の仕事" },
  { key: "retirementReason", label: "退職理由" },
  { key: "preferenceNote", label: "本人希望記入欄" },
];

export type ExistingProfile = Partial<Record<FieldKey, string | null>>;

export default function ExtractPanel({
  personId,
  personName,
  existingProfile,
}: {
  personId: number;
  personName: string;
  existingProfile: ExistingProfile;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <IconTooltip label="AI 取込み">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#A78BFA] via-[#F472B6] to-[#F59E0B] text-white shadow-md transition-transform hover:scale-110"
        >
          <SparkIcon />
        </button>
      </IconTooltip>

      {modalOpen ? (
        <ExtractModal
          personId={personId}
          personName={personName}
          existingProfile={existingProfile}
          onClose={() => setModalOpen(false)}
          onApplied={() => {
            setModalOpen(false);
            router.refresh();
            // フォーム state が古い値で上書きするのを防ぐため、
            // サーバーからのデータを確実に反映させるためにハードリロード
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
        />
      ) : null}
    </>
  );
}

type Decision = "existing" | "extracted";

function ExtractModal({
  personId,
  personName,
  existingProfile,
  onClose,
  onApplied,
}: {
  personId: number;
  personName: string;
  existingProfile: ExistingProfile;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [files, setFiles] = useState<IncomingFile[]>([]);
  const [stage, setStage] = useState<"select" | "extracting" | "review">("select");
  const [extracted, setExtracted] = useState<ExtractedCandidate>({});
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFileWithKind[]>([]);
  // 各アップロードファイルに対して確定した kind (index 単位で管理、undefined ならサジェスト値)
  const [kindChoices, setKindChoices] = useState<Record<number, string>>({});
  const [driveWarning, setDriveWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [decisions, setDecisions] = useState<Partial<Record<FieldKey, Decision>>>({});

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const next: IncomingFile[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name} は 20MB を超えるためスキップしました`);
        continue;
      }
      const dataUrl = await readAsDataUrl(file);
      next.push({
        id: `${Date.now()}-${file.name}`,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      });
    }
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const runExtract = async () => {
    if (files.length === 0) {
      alert("ファイルを1つ以上アップロードしてください");
      return;
    }
    setStage("extracting");
    setError(null);
    try {
      const response = await fetch(`/api/personnel/${personId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ fileName: f.fileName, dataUrl: f.dataUrl })),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error || "抽出に失敗しました");
        setStage("select");
        return;
      }
      const payload: ExtractedCandidate = result.extracted ?? {};
      setExtracted(payload);
      setDriveFolderUrl(result.driveFolderUrl ?? null);
      setUploaded(result.uploadedFiles ?? []);
      setDriveWarning(result.driveWarning ?? null);

      // 初期値: 衝突するフィールドは AI 提案(extracted) を優先。既存のみは existing。それ以外は extracted
      const initialDecisions: Partial<Record<FieldKey, Decision>> = {};
      for (const field of FIELD_LABELS) {
        const hasExtracted = nonEmptyString(payload[field.key]);
        const hasExisting = nonEmptyString(existingProfile[field.key]);
        if (hasExtracted && hasExisting) initialDecisions[field.key] = "extracted";
        else if (hasExtracted) initialDecisions[field.key] = "extracted";
        else if (hasExisting) initialDecisions[field.key] = "existing";
      }
      setDecisions(initialDecisions);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー");
      setStage("select");
    }
  };

  const updateExtractedValue = (key: FieldKey, value: string) => {
    setExtracted((prev) => ({ ...prev, [key]: value }));
  };

  const setDecision = (key: FieldKey, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
  };

  const apply = async () => {
    // decisions に従い、実際に反映する値を組み立てる
    const payload: ExtractedCandidate = {};
    for (const field of FIELD_LABELS) {
      const decision = decisions[field.key];
      if (decision === "extracted") {
        const value = extracted[field.key];
        if (typeof value === "string" && value.trim()) {
          (payload as Record<FieldKey, string>)[field.key] = value;
        }
      }
      // existing 選択の場合は何も送らない (既存値を保持)
    }
    if (Array.isArray(extracted.workExperiences) && extracted.workExperiences.length > 0) {
      payload.workExperiences = extracted.workExperiences;
    }

    setApplying(true);
    try {
      // 1. 書類種別の確定 (ユーザーが変更したものだけ reclassify を呼ぶ)
      const reclassifyPromises: Promise<unknown>[] = [];
      for (let i = 0; i < uploaded.length; i++) {
        const chosen = kindChoices[i];
        const suggested = uploaded[i].suggestedKind;
        const fileId = uploaded[i].fileId;
        if (!chosen || !fileId) continue;
        if (chosen === suggested) continue;
        reclassifyPromises.push(
          fetch(`/api/personnel/${personId}/documents/reclassify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId, oldKind: suggested, newKind: chosen }),
          }).catch(() => undefined),
        );
      }
      if (reclassifyPromises.length > 0) {
        await Promise.all(reclassifyPromises);
      }

      // 2. 候補者データを apply
      const response = await fetch(`/api/personnel/${personId}/apply-extracted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: payload }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        alert(result.error || "反映に失敗しました");
        return;
      }
      const u = result.updated ?? {};
      const total = (u.person ?? 0) + (u.onboarding ?? 0) + (u.resume ?? 0);
      const kindChanges = reclassifyPromises.length;
      const msgs: string[] = [];
      if (total > 0) msgs.push(`${total} 項目を反映`);
      if (kindChanges > 0) msgs.push(`${kindChanges} 件の書類種別を確定`);
      if (msgs.length === 0) {
        alert("反映する項目がありません。選択した値がすべて既存のままです。");
      } else {
        alert(`候補者情報に ${msgs.join(" / ")} しました`);
      }
      onApplied();
    } catch (err) {
      alert(err instanceof Error ? err.message : "反映に失敗しました");
    } finally {
      setApplying(false);
    }
  };

  const fieldStates = useMemo(() => {
    return FIELD_LABELS.map((field) => {
      const extractedValue = normalize(extracted[field.key]);
      const existingValue = normalize(existingProfile[field.key]);
      let status: "same" | "conflict" | "new" | "existingOnly" | "none" = "none";
      if (extractedValue && existingValue) {
        status = extractedValue === existingValue ? "same" : "conflict";
      } else if (extractedValue) {
        status = "new";
      } else if (existingValue) {
        status = "existingOnly";
      }
      return { ...field, extractedValue, existingValue, status };
    });
  }, [extracted, existingProfile]);

  const conflictCount = fieldStates.filter((f) => f.status === "conflict").length;
  const newCount = fieldStates.filter((f) => f.status === "new").length;
  const sameCount = fieldStates.filter((f) => f.status === "same").length;
  const populated = fieldStates.filter((f) => f.extractedValue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-dark)]">書類から自動入力</h3>
            <p className="mt-0.5 text-xs text-gray-500">{personName} さんの候補者情報を AI 抽出します</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {stage === "select" ? (
            <div className="space-y-4">
              <label
                className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-secondary)] bg-[var(--color-light)] px-6 py-8 text-center hover:bg-white"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void addFiles(event.dataTransfer.files);
                }}
              >
                <p className="text-sm font-semibold text-[var(--color-text-dark)]">複数ファイルをまとめてドラッグ&ドロップ または クリックして選択</p>
                <p className="mt-1 text-xs text-gray-500">
                  在留カード / パスポート / 履歴書など 画像 (JPEG/PNG) / PDF / DOCX (Word) を一度に複数アップロードできます（1ファイル最大 20MB）
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => void addFiles(e.target.files)}
                />
              </label>

              {files.length > 0 ? (
                <p className="text-xs text-gray-500">選択中: {files.length} 件</p>
              ) : null}

              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-text-dark)]">{file.fileName}</p>
                      <p className="text-xs text-gray-400">
                        {file.mimeType || "不明"} · {formatBytes(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:text-red-500"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stage === "extracting" ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
              <p className="mt-4 text-sm font-medium text-[var(--color-text-dark)]">AI が書類を読み取っています...</p>
              <p className="mt-1 text-xs text-gray-500">通常 30 秒〜1 分ほどかかります</p>
            </div>
          ) : null}

          {stage === "review" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
                抽出が完了しました。新規 {newCount} / 同一 {sameCount} / 衝突 {conflictCount} 件。
                衝突しているフィールドはどちらを採用するか選んでから反映してください。
              </div>

              {/* AI が形式不正と判定して除外したフィールドの警告 */}
              {extracted._warnings && extracted._warnings.length > 0 ? (
                <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-xs text-[#991B1B]">
                  <p className="font-semibold mb-1">⚠️ AI が形式を確信できないため除外した値があります ({extracted._warnings.length} 件):</p>
                  <ul className="space-y-0.5 list-disc pl-4">
                    {extracted._warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {extracted._warnings.length > 8 ? <li>...他 {extracted._warnings.length - 8} 件</li> : null}
                  </ul>
                  <p className="mt-1.5 text-[10px] text-gray-600">
                    必要であればフォームから手動で入力してください。これは「誤った値が自動で入る」事故を防ぐための安全装置です。
                  </p>
                </div>
              ) : null}

              {driveWarning ? (
                <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">
                  <p className="font-semibold">書類の保存について</p>
                  <pre className="mt-1 whitespace-pre-wrap font-sans">{driveWarning}</pre>
                </div>
              ) : null}

              {driveFolderUrl && uploaded.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="text-sm font-semibold text-[var(--color-text-dark)]">
                      アップロードした書類 ({uploaded.length})
                    </p>
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[var(--color-primary)] underline"
                    >
                      保管場所を開く
                    </a>
                  </div>
                  <p className="mb-2 text-[11px] text-gray-500">
                    AI が推定した書類種別を確認してください。違うときはドロップダウンで選び直せます。「反映」時に Drive ファイル名も付け直します。
                  </p>
                  <div className="space-y-2">
                    {uploaded.map((u, idx) => {
                      const chosen = kindChoices[idx] ?? u.suggestedKind ?? "other";
                      const isChanged =
                        u.suggestedKind !== undefined && chosen !== u.suggestedKind;
                      const badge =
                        u.source === "filename"
                          ? { text: "ファイル名判定", cls: "bg-[#DBEAFE] text-[#1D4ED8]" }
                          : u.source === "ai"
                            ? { text: "AI 判定", cls: "bg-[#E9D5FF] text-[#6B21A8]" }
                            : { text: "未判定", cls: "bg-gray-200 text-gray-600" };
                      return (
                        <div
                          key={u.fileId ?? idx}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={u.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-xs text-[var(--color-primary)] underline"
                              title={u.originalFileName ?? u.fileName}
                            >
                              {u.originalFileName ?? u.fileName}
                            </a>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                            >
                              {badge.text}
                              {u.confidence ? ` ・ ${u.confidence}` : ""}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">書類種別</span>
                            <select
                              value={chosen}
                              onChange={(e) =>
                                setKindChoices((prev) => ({ ...prev, [idx]: e.target.value }))
                              }
                              className={`flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/50 ${
                                isChanged
                                  ? "border-[var(--color-primary)] bg-[var(--color-light)]"
                                  : "border-gray-300 bg-white"
                              }`}
                            >
                              {ALL_DOCUMENT_KINDS.map((k) => (
                                <option key={k.kind} value={k.kind}>
                                  {k.label}
                                </option>
                              ))}
                            </select>
                            {isChanged ? (
                              <span className="text-[10px] text-[var(--color-primary)]">
                                → {getDocumentKindLabel(chosen)} に変更
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {populated.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">
                    抽出された項目 ({populated.length})
                  </p>
                  <div className="space-y-2">
                    {populated.map((field) => (
                      <FieldComparisonRow
                        key={field.key}
                        label={field.label}
                        existingValue={field.existingValue}
                        extractedValue={toInputValue(extracted[field.key])}
                        status={field.status}
                        decision={decisions[field.key] ?? (field.extractedValue ? "extracted" : "existing")}
                        onDecisionChange={(d) => setDecision(field.key, d)}
                        onExtractedChange={(v) => updateExtractedValue(field.key, v)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(extracted.workExperiences) && extracted.workExperiences.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-[var(--color-text-dark)]">職歴 ({extracted.workExperiences.length})</p>
                  <div className="space-y-2">
                    {extracted.workExperiences.map((entry, index) => (
                      <div key={index} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                        <p className="font-medium text-[var(--color-text-dark)]">{entry.companyName ?? "(会社名不明)"}</p>
                        <p className="mt-1">
                          {entry.startDate ?? "?"} 〜 {entry.endDate ?? "?"}
                        </p>
                        {entry.reason ? <p className="mt-1 whitespace-pre-wrap">{entry.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {stage === "select" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void runExtract()}
                disabled={files.length === 0}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                AI で抽出
              </button>
            </>
          ) : null}
          {stage === "review" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {applying ? "反映中..." : "選択した値で反映"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FieldComparisonRow({
  label,
  existingValue,
  extractedValue,
  status,
  decision,
  onDecisionChange,
  onExtractedChange,
}: {
  label: string;
  existingValue: string;
  extractedValue: string;
  status: "same" | "conflict" | "new" | "existingOnly" | "none";
  decision: Decision;
  onDecisionChange: (d: Decision) => void;
  onExtractedChange: (v: string) => void;
}) {
  const hasExtracted = extractedValue.trim().length > 0;
  const hasExisting = existingValue.trim().length > 0;

  const statusLabel =
    status === "conflict"
      ? { text: "値が異なる", className: "bg-[#FEF3C7] text-[#92400E]" }
      : status === "new"
        ? { text: "新規", className: "bg-[#DBEAFE] text-[#1D4ED8]" }
        : status === "same"
          ? { text: "変化なし", className: "bg-[#DCFCE7] text-[#166534]" }
          : null;

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        status === "conflict"
          ? "border-[#FDE68A] bg-[#FFFBEB]"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {statusLabel ? (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusLabel.className}`}>{statusLabel.text}</span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <label
          className={`cursor-pointer rounded-lg border-2 px-3 py-2 transition ${
            decision === "existing"
              ? "border-[var(--color-primary)] bg-[var(--color-light)]"
              : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-gray-500">既存</span>
            <input
              type="radio"
              checked={decision === "existing"}
              onChange={() => onDecisionChange("existing")}
              className="accent-[var(--color-primary)]"
            />
          </div>
          <p className="mt-1 break-words text-sm text-[var(--color-text-dark)]">
            {hasExisting ? existingValue : <span className="text-gray-400">未入力のまま保持</span>}
          </p>
        </label>

        <label
          className={`cursor-pointer rounded-lg border-2 px-3 py-2 transition ${
            decision === "extracted" && hasExtracted
              ? "border-[var(--color-primary)] bg-[var(--color-light)]"
              : "border-gray-200 bg-white"
          } ${!hasExtracted ? "opacity-50" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-gray-500">AI 抽出</span>
            <input
              type="radio"
              checked={decision === "extracted"}
              onChange={() => onDecisionChange("extracted")}
              disabled={!hasExtracted}
              className="accent-[var(--color-primary)]"
            />
          </div>
          <input
            value={extractedValue}
            onChange={(e) => onExtractedChange(e.target.value)}
            className="mt-1 w-full rounded border border-transparent bg-transparent px-0 py-0 text-sm text-[var(--color-text-dark)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toInputValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill="currentColor" stroke="none" />
      <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" fill="currentColor" stroke="none" />
      <path d="M5 16l.6 1.6L7.2 18l-1.6.4L5 20l-.6-1.6L2.8 18l1.6-.4L5 16z" fill="currentColor" stroke="none" />
    </svg>
  );
}
