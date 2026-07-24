"use client";

import { useEffect, useRef, useState } from "react";
import { BROADCAST_VARIABLES } from "@/lib/broadcast-variables";

type WaTemplateOption = {
  name: string;
  language: string;
  category: string | null;
  bodyVarCount: number;
  bodyText: string;
  examples: string[];
};

type Template = {
  id: number;
  name: string;
  content: string;
  emailSubject: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLang: string | null;
  whatsappTemplateParams: string | null;
};

/**
 * UT テンプレの各本文変数 {{n}} の中身:
 *   auto  … 送信時にパートナー/送信者から自動で入る (会社名・担当者名・姓)
 *   value … このテンプレに固定で保存する値 (募集職種=介護 など)。label は画面表示用の見出し。
 */
type VarSlot =
  | { kind: "auto"; source: string }
  | { kind: "value"; label: string; value: string };

/** ログイン中アカウントの姓を差す特殊ソース (broadcast route と一致させる) */
const ACCOUNT_LASTNAME = "account:姓";
/** UT 選択時、{{1}},{{2}},{{3}} に既定で割り当てる自動変数。残りは手入力。 */
const AUTO_DEFAULTS = ["パートナー名", "担当者名", ACCOUNT_LASTNAME];
/** 自動変数の表示名 (プレビュー用) */
const AUTO_DISPLAY: Record<string, string> = {
  パートナー名: "会社名",
  担当者名: "担当者名",
  [ACCOUNT_LASTNAME]: "姓（担当者）",
};
const autoSourceLabel = (source: string): string =>
  AUTO_DISPLAY[source] ?? BROADCAST_VARIABLES.find((v) => v.key === source)?.key ?? source;

/** 本文テキストから {{n}} の直前の見出しを推測して、手入力ラベルの初期値にする */
function deriveLabelFromBody(body: string, n: number): string {
  const idx = body.indexOf(`{{${n}}}`);
  if (idx < 0) return "";
  const before = body.slice(0, idx).replace(/\{\{\d+\}\}/g, "");
  const lines = before
    .split("\n")
    .map((l) => l.replace(/^[■●・\-\s]+/, "").replace(/[：:]\s*$/, "").trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** whatsappTemplateParams (JSON) を VarSlot[] に復元 */
function parseVarMap(stored: string | null): VarSlot[] {
  if (!stored) return [];
  try {
    const arr = JSON.parse(stored);
    if (!Array.isArray(arr)) return [];
    return arr.map((e: { auto?: string; value?: string; label?: string }) =>
      e.auto !== undefined
        ? { kind: "auto", source: e.auto }
        : { kind: "value", label: e.label ?? "", value: e.value ?? "" }
    );
  } catch {
    return [];
  }
}

/** VarSlot[] を whatsappTemplateParams (JSON) に変換 */
function serializeVarMap(varMap: VarSlot[]): string {
  return JSON.stringify(
    varMap.map((m) =>
      m.kind === "auto" ? { auto: m.source } : { value: m.value.trim(), label: m.label }
    )
  );
}

export default function TemplatesClient({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial);
  const [mode, setMode] = useState<"normal" | "ut">("normal");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [whatsappTemplateName, setWaName] = useState("");
  const [whatsappTemplateLang, setWaLang] = useState("");
  const [varMap, setVarMap] = useState<VarSlot[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Meta の承認済みテンプレ一覧 (UT ドロップダウン選択用)
  const [waOptions, setWaOptions] = useState<WaTemplateOption[]>([]);
  const [waNote, setWaNote] = useState<string | null>(null);
  const loadWaTemplates = async () => {
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json();
      if (data.ok) {
        setWaOptions(data.templates ?? []);
        setWaNote(data.note ?? null);
      } else {
        setWaOptions([]);
        setWaNote(data.error ?? "承認済みテンプレの取得に失敗しました");
      }
    } catch {
      setWaOptions([]);
      setWaNote("承認済みテンプレの取得に失敗しました");
    }
  };
  useEffect(() => {
    loadWaTemplates();
  }, []);
  const selectedWaOption = waOptions.find((o) => o.name === whatsappTemplateName);

  /** UT 作成プレビュー: 本文の {{n}} を、入力した値 / 自動項目のプレースホルダに置換して完成イメージを見せる */
  const utPreview =
    mode === "ut" && selectedWaOption?.bodyText
      ? selectedWaOption.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => {
          const slot = varMap[Number(n) - 1];
          if (!slot) return `{{${n}}}`;
          if (slot.kind === "auto") return `《${autoSourceLabel(slot.source)}》`;
          return slot.value.trim() || `【${slot.label || "未入力"}】`;
        })
      : null;

  /** UT を選択したとき: 言語をセットし、本文変数の数だけ入力欄を用意する (最初の3つは自動) */
  const selectUt = (utName: string) => {
    const sel = waOptions.find((o) => o.name === utName);
    setWaName(utName);
    if (sel) {
      setWaLang(sel.language);
      setVarMap(
        Array.from({ length: sel.bodyVarCount }, (_, i): VarSlot =>
          i < AUTO_DEFAULTS.length
            ? { kind: "auto", source: AUTO_DEFAULTS[i] }
            : { kind: "value", label: deriveLabelFromBody(sel.bodyText, i + 1), value: "" }
        )
      );
    }
  };

  /** value スロットの入力値を更新 */
  const setValue = (i: number, value: string) =>
    setVarMap((prev) =>
      prev.map((m, idx) => (idx === i && m.kind === "value" ? { ...m, value } : m))
    );

  const buildBody = () => ({
    name: name.trim(),
    content,
    emailSubject: emailSubject.trim() || null,
    whatsappTemplateName: mode === "ut" ? whatsappTemplateName.trim() || null : null,
    whatsappTemplateLang: mode === "ut" ? whatsappTemplateLang.trim() || null : null,
    whatsappTemplateParams: mode === "ut" ? serializeVarMap(varMap) || null : null,
  });

  const save = async () => {
    if (!name.trim()) {
      alert("テンプレート名を入力してください");
      return;
    }
    if (mode === "normal" && !content.trim()) {
      alert("メッセージ本文を入力してください");
      return;
    }
    if (mode === "ut") {
      if (!whatsappTemplateName.trim()) {
        alert("承認済み UT を選択してください");
        return;
      }
      if (varMap.some((m) => m.kind === "value" && !m.value.trim())) {
        alert("すべての項目に値を入力してください");
        return;
      }
    }
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/templates/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        });
        const data = await res.json();
        if (data.ok) { setTemplates((prev) => prev.map((t) => t.id === editId ? data.template : t)); reset(); }
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        });
        const data = await res.json();
        if (data.ok) { setTemplates((prev) => [data.template, ...prev]); reset(); }
      }
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm("削除しますか？")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const startEdit = (t: Template) => {
    setEditId(t.id);
    setName(t.name);
    setContent(t.content);
    setEmailSubject(t.emailSubject ?? "");
    setWaName(t.whatsappTemplateName ?? "");
    setWaLang(t.whatsappTemplateLang ?? "");
    setVarMap(parseVarMap(t.whatsappTemplateParams));
    setMode(t.whatsappTemplateName ? "ut" : "normal");
  };
  const reset = () => {
    setEditId(null);
    setMode("normal");
    setName("");
    setContent("");
    setEmailSubject("");
    setWaName("");
    setWaLang("");
    setVarMap([]);
  };

  /** カーソル位置に変数を挿入 (通常モードの本文用) */
  const insertVariable = (variable: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => c + variable);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + variable + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const grouped = {
    受信者: BROADCAST_VARIABLES.filter((v) => v.category === "受信者"),
    案件: BROADCAST_VARIABLES.filter((v) => v.category === "案件"),
  };

  return (
    <div className="grid grid-cols-2 items-start gap-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-[var(--color-text-dark)]">
            {editId ? "テンプレートを編集" : "テンプレートを作成"}
          </p>
          {/* 通常 / UT 切り替え */}
          <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-medium">
            {(["normal", "ut"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  mode === m
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-gray-500 hover:text-[var(--color-text-dark)]"
                }`}
              >
                {m === "normal" ? "通常" : "UT"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">テンプレート名</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "ut" ? "パートナー求人案内" : "急ぎ案件まとめ"} />
        </div>

        {mode === "normal" ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                メール件名 <span className="text-[10px] text-gray-400">(メール配信時のみ使用、空欄なら共通デフォルト)</span>
              </label>
              <input
                className={INPUT}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="【SMILE MATCHING】今週の急ぎ案件のご案内"
              />
            </div>
            <div>
              <div className="flex items-end justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">メッセージ本文</label>
                <p className="text-[10px] text-gray-400">{'{{}}'} 変数は配信時に自動展開されます</p>
              </div>
              <textarea
                ref={textareaRef}
                className={`${INPUT} h-40 resize-none font-mono text-[13px]`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="{{パートナー名}} 様&#10;&#10;現在の急ぎ案件です:&#10;{{急ぎ案件一覧}}"
              />
            </div>

            {/* 変数挿入チップ */}
            <div className="space-y-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-semibold text-gray-500">変数を挿入</p>
              {(["受信者", "案件"] as const).map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] text-gray-400 mb-1">{cat}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {grouped[cat].map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.label)}
                        title={v.description}
                        className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-[var(--color-text-dark)] hover:border-[var(--color-primary)] hover:bg-[var(--color-light)] hover:text-[var(--color-primary)]"
                      >
                        + {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* UT (WhatsApp 承認テンプレ) 選択 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">承認済み UT を選択</label>
                <button type="button" onClick={loadWaTemplates} className="text-[10px] text-[var(--color-primary)] hover:underline">
                  再読込
                </button>
              </div>
              {waOptions.length > 0 ? (
                <select className={INPUT} value={whatsappTemplateName} onChange={(e) => selectUt(e.target.value)}>
                  <option value="">選択してください</option>
                  {waOptions.map((o) => (
                    <option key={`${o.name}:${o.language}`} value={o.name}>
                      {o.name}（{o.language}・本文変数 {o.bodyVarCount} 個）
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  {waNote ?? "承認済み UT を取得できませんでした"}。承認されると「再読込」で表示されます。
                </p>
              )}
              {whatsappTemplateName && !selectedWaOption && waOptions.length > 0 ? (
                <p className="mt-1 text-[10px] text-amber-600">
                  「{whatsappTemplateName}」は現在の承認一覧に見つかりません（削除/未承認の可能性）
                </p>
              ) : null}
            </div>

            {/* 本文変数の割り当てフォーム */}
            {whatsappTemplateName && varMap.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-3">
                <p className="text-[11px] font-semibold text-[#15803D]">求人内容を入力</p>
                <p className="text-[10px] text-gray-500 leading-snug">
                  この求人の内容を入力してテンプレとして保存します。会社名・担当者名・姓は<b>送信時に自動</b>で入ります。
                  保存後は一斉連絡で<b>選ぶだけ</b>で送れます。
                </p>
                {varMap.some((s) => s.kind === "value") ? (
                  varMap.map((slot, i) =>
                    slot.kind === "value" ? (
                      <div key={i}>
                        <label className="mb-0.5 block text-[11px] font-medium text-[#0F172A]">
                          {slot.label || `項目 ${i + 1}`}
                        </label>
                        <input
                          className={INPUT}
                          value={slot.value}
                          onChange={(e) => setValue(i, e.target.value)}
                          placeholder={
                            selectedWaOption?.examples?.[i]
                              ? `例: ${selectedWaOption.examples[i]}`
                              : "値を入力"
                          }
                        />
                      </div>
                    ) : null
                  )
                ) : (
                  <p className="text-[10px] text-gray-400">入力項目はありません</p>
                )}
              </div>
            ) : null}

            {/* 構成プレビュー: {{n}} が割り当て内容にどう入るか (【】=送信時入力 / 《》=配信変数) */}
            {utPreview ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1 text-[10px] font-semibold text-gray-500">構成プレビュー</p>
                <div className="rounded-lg bg-white px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--color-text-dark)] shadow-sm">
                  {utPreview}
                </div>
                <p className="mt-1 text-[10px] text-gray-400">
                  【 】= 送信時に入力 ／ 《 》= 配信変数（パートナーごと自動）。実際の値は一斉連絡の画面で入ります。
                </p>
              </div>
            ) : null}

            {/* WhatsApp 以外 (LINE / メール) のパートナー向け本文 (任意) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                LINE / メール用 本文 <span className="text-[10px] text-gray-400">(WhatsApp 以外のパートナー向け・任意)</span>
              </label>
              <textarea
                ref={textareaRef}
                className={`${INPUT} h-24 resize-none font-mono text-[13px]`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="{{パートナー名}} 様&#10;（WhatsApp 以外のパートナーに送られる本文）"
              />
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="bg-[var(--color-primary)] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
            {saving ? "保存中..." : editId ? "更新" : "作成"}
          </button>
          {editId && <button onClick={reset} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">キャンセル</button>}
        </div>
      </div>

      <div className="max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-2">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-dark)] text-sm">{t.name}</p>
                {t.whatsappTemplateName ? (
                  <span className="mt-1 inline-block rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D]">
                    UT: {t.whatsappTemplateName}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-3 text-xs">
                <button onClick={() => startEdit(t)} className="text-[var(--color-primary)] hover:underline">編集</button>
                <button onClick={() => del(t.id)} className="text-red-400 hover:underline">削除</button>
              </div>
            </div>
            {t.content ? (
              <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{t.content}</p>
            ) : null}
          </div>
        ))}
        {templates.length === 0 && <p className="text-sm text-gray-400 text-center py-6">テンプレートがありません</p>}
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]";
