/**
 * 企業の担当者 (先方の窓口) と連絡手段。Company.contacts に配列で持つ (複数人)。
 * メールならアドレス、SNS ならリンク、電話なら番号を value に入れる。
 */

export const CONTACT_METHODS = ["メール", "LINE", "Facebook", "電話", "その他"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export type CompanyContact = { name: string; method: ContactMethod; value: string };

/** DB の JSON / 画面からの入力を、空の行を除いた担当者の一覧にそろえる */
export function readCompanyContacts(value: unknown): CompanyContact[] {
  if (!Array.isArray(value)) return [];
  const out: CompanyContact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 100) : "";
    const v = typeof r.value === "string" ? r.value.trim().slice(0, 500) : "";
    if (!name && !v) continue;
    const method = (CONTACT_METHODS as readonly string[]).includes(String(r.method)) ? (r.method as ContactMethod) : "その他";
    out.push({ name, method, value: v });
  }
  return out;
}

/** 押したときに開くリンク (メール → mailto、電話 → tel、SNS は URL のとき) */
export function contactHref(c: CompanyContact): string | null {
  const v = c.value.trim();
  if (!v) return null;
  if (c.method === "メール" || /^[^\s@]+@[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (c.method === "電話") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (/^https?:\/\//i.test(v)) return v;
  return null;
}

/** 入力欄の見本 (連絡手段ごと) */
export const CONTACT_PLACEHOLDERS: Record<ContactMethod, string> = {
  メール: "yamada@example.co.jp",
  LINE: "https://line.me/ti/p/...",
  Facebook: "https://www.facebook.com/...",
  電話: "090-1234-5678",
  その他: "リンクや ID",
};
