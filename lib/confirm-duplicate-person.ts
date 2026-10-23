/**
 * 候補者を登録する前に、名前・生年月日が同じ候補者がいないか確かめ、いれば「本当に登録しますか？」と聞く (画面用)。
 * 判定はサーバー (lib/duplicate-person.ts) で行う。チェック自体が失敗したときは登録を止めない。
 * @returns 登録してよければ true
 */

type Query = { name?: string | null; englishName?: string | null; birthDate?: string | null };
type Hit = { id: number; name: string; englishName: string | null; birthDate: string | null };

export async function confirmNoDuplicatePersons(candidates: Query[]): Promise<boolean> {
  let duplicates: Hit[][] = [];
  try {
    const res = await fetch("/api/personnel/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return true;
    duplicates = data.duplicates ?? [];
  } catch {
    return true;
  }
  const blocks = candidates
    .map((c, i) => ({ c, hits: duplicates[i] ?? [] }))
    .filter((x) => x.hits.length > 0)
    .map(({ c, hits }) => {
      const label = c.englishName?.trim() || c.name?.trim() || "(名前なし)";
      const lines = hits.map(
        (h) => `  ・ID ${String(h.id).padStart(4, "0")} ${h.englishName || h.name}${h.birthDate ? `（生年月日 ${h.birthDate}）` : ""}`,
      );
      return `「${label}」と名前・生年月日が同じ候補者がすでにいます:\n${lines.join("\n")}`;
    });
  if (blocks.length === 0) return true;
  return window.confirm(`${blocks.join("\n\n")}\n\n同じ人を二重に登録していないか確認してください。\n本当に登録しますか？`);
}
