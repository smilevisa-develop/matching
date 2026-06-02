"use client";

import { useRef, useState } from "react";
import { BROADCAST_VARIABLES } from "@/lib/broadcast-variables";

type Template = { id: number; name: string; content: string };

export default function TemplatesClient({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const save = async () => {
    if (!name.trim() || !content.trim()) { alert("名前とメッセージを入力してください"); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/templates/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content }),
        });
        const data = await res.json();
        if (data.ok) { setTemplates((prev) => prev.map((t) => t.id === editId ? data.template : t)); reset(); }
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content }),
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

  const startEdit = (t: Template) => { setEditId(t.id); setName(t.name); setContent(t.content); };
  const reset = () => { setEditId(null); setName(""); setContent(""); };

  /** カーソル位置に変数を挿入 */
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
    // カーソルを挿入後の位置に
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
        <p className="font-semibold text-[var(--color-text-dark)]">{editId ? "テンプレートを編集" : "テンプレートを作成"}</p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">テンプレート名</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="急ぎ案件まとめ" />
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
            <div className="flex items-start justify-between">
              <p className="font-medium text-[var(--color-text-dark)] text-sm">{t.name}</p>
              <div className="flex gap-3 text-xs">
                <button onClick={() => startEdit(t)} className="text-[var(--color-primary)] hover:underline">編集</button>
                <button onClick={() => del(t.id)} className="text-red-400 hover:underline">削除</button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{t.content}</p>
          </div>
        ))}
        {templates.length === 0 && <p className="text-sm text-gray-400 text-center py-6">テンプレートがありません</p>}
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]";
