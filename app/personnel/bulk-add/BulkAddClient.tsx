"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, NATIONALITIES, RESIDENCE_STATUSES } from "@/lib/candidate-profile";

type Partner = { id: number; name: string; country: string | null };

/** API から返ってくる 1 ファイルぶんの抽出結果 */
type ExtractedCandidate = {
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
  workExperiences?: {
    companyName?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  }[];
};

type ExtractItem =
  | { fileName: string; ok: true; candidate: ExtractedCandidate; warnings: string[] }
  | { fileName: string; ok: false; error: string };

/** カードの編集状態 (登録対象になる) */
type CardState = ExtractedCandidate & {
  fileName: string;
  partnerId: number | null;
  channel: string;
  include: boolean; // チェック外したらスキップ
  warnings: string[];
};

const MAX_FILES = 10;

export default function BulkAddClient({ partners }: { partners: Partner[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [cards, setCards] = useState<CardState[]>([]);
  const [extractFailures, setExtractFailures] = useState<{ fileName: string; error: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [bulkPartnerId, setBulkPartnerId] = useState<string>("");
  const [bulkChannel, setBulkChannel] = useState<string>("未設定");

  const handleFilePick = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const next: File[] = [];
    for (const f of Array.from(picked)) {
      if (!allowed.includes(f.type)) {
        alert(`サポート外の形式: ${f.name} (${f.type})\nPDF / JPG / PNG のみ`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MAX_FILES) {
        alert(`一度に処理できるのは ${MAX_FILES} ファイルまでです。先頭 ${MAX_FILES} 件のみ採用します。`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setExtractProgress(0);
    setCards([]);
    setExtractFailures([]);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      // 進捗は厳密には取れないが、ボタン表示で「N 件処理中...」表示
      setExtractProgress(1);
      const res = await fetch("/api/personnel/bulk-extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        alert("解析失敗: " + data.error);
        return;
      }
      const items = data.items as ExtractItem[];
      const newCards: CardState[] = [];
      const failures: { fileName: string; error: string }[] = [];
      for (const it of items) {
        if (it.ok) {
          newCards.push({
            ...it.candidate,
            fileName: it.fileName,
            partnerId: bulkPartnerId ? Number(bulkPartnerId) : null,
            channel: bulkChannel,
            include: true,
            warnings: it.warnings,
          });
        } else {
          failures.push({ fileName: it.fileName, error: it.error });
        }
      }
      setCards(newCards);
      setExtractFailures(failures);
      setExtractProgress(items.length);
    } catch (e) {
      alert("通信エラー: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setExtracting(false);
    }
  };

  const updateCard = (idx: number, patch: Partial<CardState>) => {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const includedCount = useMemo(() => cards.filter((c) => c.include && c.name?.trim()).length, [cards]);

  const handleBulkCreate = async () => {
    const targets = cards.filter((c) => c.include && c.name?.trim());
    if (targets.length === 0) {
      alert("登録対象が 0 件です。少なくとも 1 件チェックを入れ、名前を入力してください。");
      return;
    }
    if (!confirm(`${targets.length} 件の候補者を一括登録します。よろしいですか?`)) return;

    setCreating(true);
    try {
      const res = await fetch("/api/personnel/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: targets.map((c) => ({
            name: c.name,
            englishName: c.englishName,
            nationality: c.nationality,
            residenceStatus: c.residenceStatus,
            channel: c.channel,
            email: c.email,
            phoneNumber: c.phoneNumber,
            partnerId: c.partnerId,
            birthDate: c.birthDate,
            postalCode: c.postalCode,
            address: c.address,
            gender: c.gender,
            visaExpiryDate: c.visaExpiryDate,
            japaneseLevel: c.japaneseLevel,
            japaneseLevelDate: c.japaneseLevelDate,
            licenseName: c.licenseName,
            licenseExpiryDate: c.licenseExpiryDate,
            otherQualificationName: c.otherQualificationName,
            otherQualificationExpiryDate: c.otherQualificationExpiryDate,
            traineeExperience: c.traineeExperience,
            spouseStatus: c.spouseStatus,
            childrenCount: c.childrenCount,
            highSchoolName: c.highSchoolName,
            highSchoolStartDate: c.highSchoolStartDate,
            highSchoolEndDate: c.highSchoolEndDate,
            universityName: c.universityName,
            universityStartDate: c.universityStartDate,
            universityEndDate: c.universityEndDate,
            motivation: c.motivation,
            selfIntroduction: c.selfIntroduction,
            japanPurpose: c.japanPurpose,
            currentJob: c.currentJob,
            retirementReason: c.retirementReason,
            preferenceNote: c.preferenceNote,
            workExperiences: c.workExperiences,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert("登録失敗: " + data.error);
        return;
      }
      const createdN = (data.created as { id: number }[]).length;
      const failedN = (data.failed as { error: string }[] | undefined)?.length ?? 0;
      if (failedN > 0) {
        const fails = (data.failed as { name: string; error: string }[])
          .map((f) => `  - ${f.name}: ${f.error}`)
          .join("\n");
        alert(`✅ ${createdN} 件 登録完了\n❌ ${failedN} 件 失敗:\n${fails}`);
      } else {
        alert(`✅ ${createdN} 件 すべて登録完了`);
      }
      router.push("/personnel");
    } catch (e) {
      alert("通信エラー: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ============== STEP 1: ファイル投入 ============== */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[var(--color-text-dark)]">
            ① 履歴書ファイルを選択 ({files.length}/{MAX_FILES})
          </p>
          {files.length > 0 && (
            <button onClick={() => setFiles([])} className="text-xs text-red-600 hover:underline">
              全てクリア
            </button>
          )}
        </div>

        <label
          className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-light)]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFilePick(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilePick(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-sm text-gray-600">
            📥 ここにファイルをドラッグ&ドロップ、または<span className="text-[var(--color-primary)] font-medium">クリックして選択</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF / JPG / PNG, 1 ファイル 15MB まで, 最大 {MAX_FILES} 件</p>
        </label>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5">
                <span className="truncate">
                  📄 {f.name} <span className="text-gray-400">({(f.size / 1024).toFixed(0)} KB)</span>
                </span>
                <button onClick={() => removeFile(idx)} className="text-red-600 hover:underline ml-2">
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 一括設定 */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
          <div>
            <label className="text-xs font-medium text-gray-600">パートナー (全件共通の初期値)</label>
            <select
              value={bulkPartnerId}
              onChange={(e) => setBulkPartnerId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-1"
            >
              <option value="">未設定</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.country ? `(${p.country})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">主な連絡手段 (全件共通の初期値)</label>
            <select
              value={bulkChannel}
              onChange={(e) => setBulkChannel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-1"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleExtract}
          disabled={extracting || files.length === 0}
          className="w-full bg-[var(--color-primary)] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {extracting ? `🤖 AI 解析中... (推定 ${files.length * 8} 秒)` : `② AI 解析開始 (${files.length} ファイル)`}
        </button>
      </div>

      {/* ============== STEP 3: 結果カード ============== */}
      {extractFailures.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-red-800 mb-2">⚠️ AI 解析に失敗したファイル ({extractFailures.length} 件)</p>
          <ul className="space-y-1 text-xs text-red-700">
            {extractFailures.map((f, idx) => (
              <li key={idx}>📄 {f.fileName} — {f.error}</li>
            ))}
          </ul>
        </div>
      )}

      {cards.length > 0 && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
            <p className="font-semibold text-emerald-800">
              ✅ {cards.length} 件 解析完了 (登録対象: {includedCount} 件)
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              ↓ 各カードの内容を確認・編集してください。チェックを外すと登録されません。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cards.map((card, idx) => (
              <CandidateCard
                key={idx}
                card={card}
                partners={partners}
                onChange={(patch) => updateCard(idx, patch)}
              />
            ))}
          </div>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button
              onClick={handleBulkCreate}
              disabled={creating || includedCount === 0}
              className="bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl text-base font-semibold shadow-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {creating ? "登録中..." : `③ ${includedCount} 件 一括登録`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============== 各候補者カード ==============

function CandidateCard({
  card,
  partners,
  onChange,
}: {
  card: CardState;
  partners: Partner[];
  onChange: (patch: Partial<CardState>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm space-y-3 ${
        card.include ? "border-gray-200" : "border-gray-200 opacity-50 bg-gray-50"
      }`}
    >
      {/* ヘッダ */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={card.include}
            onChange={(e) => onChange({ include: e.target.checked })}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          📄 {card.fileName}
        </label>
        <button onClick={() => setExpanded((e) => !e)} className="text-xs text-[var(--color-primary)] hover:underline">
          {expanded ? "簡易表示" : "全項目編集"}
        </button>
      </div>

      {card.warnings.length > 0 && (
        <div className="text-[10px] bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">
          ⚠️ {card.warnings.join(" / ")}
        </div>
      )}

      {/* 主要フィールド (簡易表示時もこれだけは見せる) */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="名前 (カナ) *" value={card.name} onChange={(v) => onChange({ name: v })} required />
        <Field label="英語名" value={card.englishName} onChange={(v) => onChange({ englishName: v })} />
        <SelectField
          label="国籍"
          value={card.nationality ?? "その他"}
          options={[...NATIONALITIES]}
          onChange={(v) => onChange({ nationality: v })}
        />
        <SelectField
          label="在留資格"
          value={card.residenceStatus ?? "不明"}
          options={[...RESIDENCE_STATUSES]}
          onChange={(v) => onChange({ residenceStatus: v })}
        />
        <Field label="生年月日 (YYYY-MM-DD)" value={card.birthDate} onChange={(v) => onChange({ birthDate: v })} />
        <Field label="性別" value={card.gender} onChange={(v) => onChange({ gender: v })} />
        <Field label="電話" value={card.phoneNumber} onChange={(v) => onChange({ phoneNumber: v })} />
        <Field label="メール" value={card.email} onChange={(v) => onChange({ email: v })} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-[10px] font-medium text-gray-600">パートナー</label>
          <select
            value={card.partnerId ?? ""}
            onChange={(e) => onChange({ partnerId: e.target.value ? Number(e.target.value) : null })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-0.5"
          >
            <option value="">未設定</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-600">主な連絡手段</label>
          <select
            value={card.channel}
            onChange={(e) => onChange({ channel: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-0.5"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 拡張表示 (全項目) */}
      {expanded && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Field label="日本語レベル" value={card.japaneseLevel} onChange={(v) => onChange({ japaneseLevel: v })} />
            <Field label="郵便番号" value={card.postalCode} onChange={(v) => onChange({ postalCode: v })} />
            <Field
              label="住所"
              value={card.address}
              onChange={(v) => onChange({ address: v })}
              full
            />
            <Field label="高校名" value={card.highSchoolName} onChange={(v) => onChange({ highSchoolName: v })} />
            <Field label="大学名" value={card.universityName} onChange={(v) => onChange({ universityName: v })} />
            <Field label="ビザ期限" value={card.visaExpiryDate} onChange={(v) => onChange({ visaExpiryDate: v })} />
            <Field
              label="実習経験"
              value={card.traineeExperience}
              onChange={(v) => onChange({ traineeExperience: v })}
            />
            <Field label="現在の仕事" value={card.currentJob} onChange={(v) => onChange({ currentJob: v })} />
          </div>
          {card.workExperiences && card.workExperiences.length > 0 && (
            <p className="text-[10px] text-gray-500">職歴 {card.workExperiences.length} 件 (自動取込み)</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  full,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-[10px] font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded px-2 py-1 text-xs mt-0.5 ${
          required && !value?.trim()
            ? "border-red-300 bg-red-50"
            : "border-gray-300"
        }`}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-0.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
