/**
 * 候補者の二重登録チェック (2026/10: 202 と 296 が同じ人で二重登録されていたため)。
 *
 * 名前 (英語名 or カタカナ名) が同じで、生年月日も同じ (どちらかが未入力なら名前だけ) の候補者を返す。
 * 名前は空白・アクセント記号・大文字小文字の違いを無視して比べる
 * (例: 「NGUYỄN THỊ HẢi VÂN」と「NGUYEN THI HAI VAN」、「グエン　テイ」と「グエン テイ」は同じ)。
 * 登録を止めるのではなく、画面で「本当に登録しますか？」と確認するために使う。
 */

import { prisma } from "@/lib/prisma";

export type DuplicateQuery = { name?: string | null; englishName?: string | null; birthDate?: string | null };
export type DuplicateHit = { id: number; name: string; englishName: string | null; birthDate: string | null };

/** 英語名: アクセント記号・空白・記号を除いて大文字に */
export function normalizeLatinName(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/** カタカナ名: 空白 (全角含む)・中点・長音以外の記号を除く */
export function normalizeKanaName(v: string | null | undefined): string {
  return (v ?? "").normalize("NFKC").replace(/[\s　・･.,、。()（）]/g, "");
}

/** 生年月日: 数字だけ (2001/07/16 と 2001-07-16 を同じに) */
export function normalizeBirthDate(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : "";
}

export async function findDuplicatePersons(queries: DuplicateQuery[]): Promise<DuplicateHit[][]> {
  const people = await prisma.person.findMany({
    select: { id: true, name: true, onboarding: { select: { englishName: true, birthDate: true } } },
  });
  const index = people.map((p) => ({
    hit: { id: p.id, name: p.name, englishName: p.onboarding?.englishName ?? null, birthDate: p.onboarding?.birthDate ?? null },
    latin: normalizeLatinName(p.onboarding?.englishName),
    kana: normalizeKanaName(p.name),
    birth: normalizeBirthDate(p.onboarding?.birthDate),
  }));
  return queries.map((q) => {
    const latin = normalizeLatinName(q.englishName);
    // 名前欄に英字で書かれることもあるので、英字の名前は英語名とも比べる
    const nameLatin = normalizeLatinName(q.name);
    const kana = normalizeKanaName(q.name);
    const birth = normalizeBirthDate(q.birthDate);
    return index
      .filter((p) => {
        const sameName =
          (latin.length >= 4 && (p.latin === latin || normalizeLatinName(p.hit.name) === latin)) ||
          (nameLatin.length >= 4 && p.latin === nameLatin) ||
          (kana.length >= 2 && p.kana === kana);
        if (!sameName) return false;
        // 生年月日が両方わかっていて違うなら別人
        return !birth || !p.birth || birth === p.birth;
      })
      .map((p) => p.hit);
  });
}
