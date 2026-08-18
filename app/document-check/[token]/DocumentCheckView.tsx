"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 事前確認資料の候補者向け表示。
 *
 * 母国語を大きく、日本語を対訳として下に並べる。
 *   - 会社の考え方 (kind: "read")  … 読むだけ。チェックは求めない
 *   - ルール       (kind: "check") … 「確認しました」を付けてもらう
 * どのセクションにも「わからない」を置く。分からないまま進まれるより、
 * 分からない箇所を教えてもらえた方が面談で説明できるため。
 */

export type DocumentItemView = {
  key: string;
  title: string;
  body: string;
  trTitle: string;
  trBody: string;
  kind: "read" | "check";
};

/**
 * 画面の固定文言 (母国語)。
 * 読むのは候補者なので、母国語を主・日本語を従にして表示する。
 * 説明文がボタン名を指すため、ボタンの表記と必ず揃えること。
 */
type UiText = {
  intro: string;
  check: string;
  unclear: string;
  readOnly: string;
  /** 全部確認できたときのメッセージ */
  done: string;
  /** 残り件数。{n} が件数に置き換わる */
  remaining: string;
  /** 「わからない」が付いているときの補足。{n} が件数に置き換わる */
  unclearNote: string;
};

const UI_TEXT: Record<string, UiText> = {
  vi: {
    intro:
      "Trước khi bắt đầu làm việc, chúng tôi xin nói những điều quan trọng.\nHãy đọc. Nếu bạn đã hiểu, hãy nhấn「Đã hiểu」.\nChỗ nào không hiểu, hãy nhấn「Không hiểu」. Người phụ trách sẽ giải thích sau.",
    check: "Đã hiểu",
    unclear: "Không hiểu",
    readOnly: "Chỉ cần đọc",
    done: "Bạn đã xác nhận xong tất cả. Cảm ơn bạn.",
    remaining: "Còn {n} mục",
    unclearNote: "Người phụ trách sẽ giải thích {n} chỗ bạn chưa hiểu.",
  },
  id: {
    intro:
      "Sebelum mulai bekerja, kami sampaikan hal-hal yang penting.\nSilakan baca. Kalau sudah paham, tekan「Saya paham」.\nKalau ada yang tidak paham, tekan「Tidak paham」. Nanti penanggung jawab akan menjelaskan.",
    check: "Saya paham",
    unclear: "Tidak paham",
    readOnly: "Cukup dibaca",
    done: "Semua sudah dikonfirmasi. Terima kasih.",
    remaining: "Sisa {n} item",
    unclearNote: "Penanggung jawab akan menjelaskan {n} bagian yang belum Anda pahami.",
  },
  my: {
    intro:
      "အလုပ်မစခင် အရေးကြီးတဲ့အချက်တွေကို ပြောပြပါမယ်။\nဖတ်ပါ။ နားလည်ရင်「နားလည်ပါပြီ」ကို နှိပ်ပါ။\nနားမလည်တဲ့နေရာကို「နားမလည်ပါ」ကို နှိပ်ပါ။ တာဝန်ခံက နောက်မှ ရှင်းပြပါမယ်။",
    check: "နားလည်ပါပြီ",
    unclear: "နားမလည်ပါ",
    readOnly: "ဖတ်ရုံသာ",
    done: "အားလုံး အတည်ပြုပြီးပါပြီ။ ကျေးဇူးတင်ပါတယ်။",
    remaining: "နောက်ထပ် {n} ခု",
    unclearNote: "နားမလည်တဲ့ {n} နေရာကို တာဝန်ခံက ရှင်းပြပါမယ်။",
  },
  ne: {
    intro:
      "काम सुरु गर्नु अघि महत्त्वपूर्ण कुराहरू बताउँछौं।\nपढ्नुहोस्। बुझ्नुभयो भने「बुझें」थिच्नुहोस्।\nनबुझेको ठाउँमा「बुझिनँ」थिच्नुहोस्। पछि जिम्मेवार व्यक्तिले बुझाउनुहुनेछ।",
    check: "बुझें",
    unclear: "बुझिनँ",
    readOnly: "पढ्ने मात्र",
    done: "सबै पुष्टि भयो। धन्यवाद।",
    remaining: "बाँकी {n} वटा",
    unclearNote: "तपाईंले नबुझेको {n} ठाउँ जिम्मेवार व्यक्तिले बुझाउनुहुनेछ।",
  },
};

/** 日本語 (対訳として下に小さく出す) */
const JA_TEXT: UiText = {
  intro:
    "働く前に、大切なことをお伝えします。\n読んで、分かったら「確認しました」を押してください。\n分からないところは「わからない」を押してください。あとで担当者が説明します。",
  check: "確認しました",
  unclear: "わからない",
  readOnly: "読むだけ",
  done: "すべて確認できました。ありがとうございました。",
  remaining: "あと {n} 項目",
  unclearNote: "「わからない」{n} 件は、担当者があとで説明します。",
};

export default function DocumentCheckView({
  token,
  language,
  documentTitle,
  companyName,
  items,
  initialChecked,
  initialUnclear,
}: {
  token: string;
  language: string;
  documentTitle: string;
  companyName: string;
  items: DocumentItemView[];
  initialChecked: Record<string, boolean>;
  initialUnclear: Record<string, boolean>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecked);
  const [unclear, setUnclear] = useState<Record<string, boolean>>(initialUnclear);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新の状態を ref にも持つ。
  // state だけだと、続けてタップしたときに後の処理が古い state を掴んでしまい、
  // まとめ送信で先のタップが消える (実際に「確認しました」が保存されない不具合が出た)。
  const checkedRef = useRef(initialChecked);
  const unclearRef = useRef(initialUnclear);

  // 開封を記録
  useEffect(() => {
    void fetch(`/api/document-check/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open" }),
    }).catch(() => {});
  }, [token]);

  // チェック対象は kind: "check" のみ。会社の考え方は読むだけ
  const checkTargets = useMemo(() => items.filter((i) => i.kind === "check"), [items]);
  const doneCount = checkTargets.filter((i) => checked[i.key]).length;
  const allChecked = checkTargets.length > 0 && doneCount === checkTargets.length;
  const unclearCount = items.filter((i) => unclear[i.key]).length;

  /** 連打しても 1 回にまとめて保存する (送るのは常に ref の最新状態) */
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/document-check/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            checkedItems: checkedRef.current,
            unclearItems: unclearRef.current,
          }),
        });
        setSavedNote("保存しました / Saved");
        setTimeout(() => setSavedNote(null), 1800);
      } catch {
        setSavedNote("保存できませんでした。通信を確認してください。");
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const toggleChecked = (key: string) => {
    const next = { ...checkedRef.current };
    if (next[key]) delete next[key];
    else next[key] = true;
    checkedRef.current = next;
    setChecked(next);
    scheduleSave();
  };

  const toggleUnclear = (key: string) => {
    const next = { ...unclearRef.current };
    if (next[key]) delete next[key];
    else next[key] = true;
    unclearRef.current = next;
    setUnclear(next);
    scheduleSave();
  };

  // 未対応の言語コードが来ても落ちないよう、日本語にフォールバックする
  const t = UI_TEXT[language] ?? JA_TEXT;
  const unclearLabel = t.unclear;
  /** 文言の {n} を件数に置き換える */
  const fill = (template: string, n: number) => template.replace("{n}", String(n));

  return (
    <div className="min-h-screen bg-[var(--color-light)] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-3">
        {/* ヘッダー */}
        <div className="rounded-2xl bg-white p-5 shadow-md">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-primary)]">
            SMILE MATCHING
          </p>
          <h1 className="mt-1 text-lg font-bold text-[var(--color-text-dark)]">{documentTitle}</h1>
          <p className="mt-1 text-sm text-gray-600">{companyName}</p>
          {/* 説明: 母国語を主、日本語を対訳として下に置く */}
          <p className="mt-3 whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-[var(--color-text-dark)]">
            {t.intro}
          </p>
          {t !== JA_TEXT ? (
            <p className="mt-2 whitespace-pre-wrap border-t border-gray-100 pt-2 text-[11px] leading-relaxed text-gray-500">
              {JA_TEXT.intro}
            </p>
          ) : null}
          {/* 進捗 (チェックが必要な項目だけ) */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{
                width: `${checkTargets.length ? (doneCount / checkTargets.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            {doneCount} / {checkTargets.length}
          </p>
        </div>

        {items.map((item, idx) => {
          const on = Boolean(checked[item.key]);
          const ng = Boolean(unclear[item.key]);
          const needsCheck = item.kind === "check";
          return (
            <div
              key={item.key}
              className={`rounded-2xl border px-4 py-4 ${
                ng
                  ? "border-amber-300 bg-amber-50"
                  : on
                    ? "border-[#BBF7D0] bg-[#F0FDF4]"
                    : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                  {idx + 1}
                </span>
                {!needsCheck ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                    {t === JA_TEXT ? t.readOnly : `${t.readOnly} / ${JA_TEXT.readOnly}`}
                  </span>
                ) : null}
              </div>

              {/* 母国語 (大きく) */}
              <p className="mt-2 text-[15px] font-bold text-[var(--color-primary)]">
                {item.trTitle}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-[var(--color-text-dark)]">
                {item.trBody}
              </p>

              {/* 日本語 (対訳) */}
              <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] font-semibold text-gray-400">
                {item.title}
              </p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500">
                {item.body}
              </p>

              {/* 操作 */}
              <div className="mt-3 flex flex-wrap gap-2">
                {needsCheck ? (
                  <button
                    type="button"
                    onClick={() => toggleChecked(item.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      on
                        ? "bg-[#16A34A] text-white"
                        : "border border-[#16A34A] bg-white text-[#16A34A]"
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t === JA_TEXT ? t.check : `${t.check} / ${JA_TEXT.check}`}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleUnclear(item.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    ng
                      ? "bg-amber-500 text-white"
                      : "border border-amber-400 bg-white text-amber-700"
                  }`}
                >
                  ? {unclearLabel}
                </button>
              </div>
            </div>
          );
        })}

        {/* まとめ */}
        <div className="rounded-2xl bg-white p-5 text-center shadow-md">
          {allChecked ? (
            <>
              <p className="text-sm font-semibold text-[#15803D]">{t.done}</p>
              {t !== JA_TEXT ? (
                <p className="mt-0.5 text-[11px] text-gray-500">{JA_TEXT.done}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--color-text-dark)]">
                {fill(t.remaining, checkTargets.length - doneCount)}
              </p>
              {t !== JA_TEXT ? (
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {fill(JA_TEXT.remaining, checkTargets.length - doneCount)}
                </p>
              ) : null}
            </>
          )}
          {unclearCount > 0 ? (
            <>
              <p className="mt-2 text-[12px] font-medium text-amber-700">
                {fill(t.unclearNote, unclearCount)}
              </p>
              {t !== JA_TEXT ? (
                <p className="text-[10px] text-amber-600">
                  {fill(JA_TEXT.unclearNote, unclearCount)}
                </p>
              ) : null}
            </>
          ) : null}
          {saving ? <p className="mt-1 text-[11px] text-gray-400">保存中…</p> : null}
          {savedNote ? <p className="mt-1 text-[11px] text-[#15803D]">{savedNote}</p> : null}
        </div>
      </div>
    </div>
  );
}
