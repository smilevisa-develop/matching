/**
 * PDF からページ単位でテキストを抽出する。
 *
 * unpdf を使用 (Node / serverless 用に作られた pdfjs-dist ラッパー)。
 * pdfjs-dist を直接使うと "Cannot find module pdf.worker.mjs" でコケる
 * バンドラ環境でも、unpdf は worker 不要で動く。
 *
 * 戻り値はページ別テキスト + 元のテキスト item 群。
 */

export type PdfTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPage = {
  pageNumber: number;
  text: string;
  items: PdfTextItem[];
};

export async function extractPdfPages(input: Buffer | Uint8Array): Promise<PdfPage[]> {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const data = input instanceof Buffer ? new Uint8Array(input) : input;
  const pdf = await getDocumentProxy(data);

  // unpdf の extractTextItems は ページ別 items[][] を返してくれる
  const result = await extractTextItems(pdf);
  const pageItems = result.items; // StructuredTextItem[][]

  return pageItems.map((items, idx) => {
    // y 座標で行を組み直す (上から下、同じ y は左から右に並べる)
    type Line = { y: number; parts: { x: number; text: string }[] };
    const lines: Line[] = [];
    for (const it of items) {
      const text = it.str ?? "";
      if (!text) continue;
      const existing = lines.find((l) => Math.abs(l.y - it.y) < 4);
      if (existing) existing.parts.push({ x: it.x, text });
      else lines.push({ y: it.y, parts: [{ x: it.x, text }] });
    }
    // PDF は左下原点なので y が大きいほど上 = 先頭
    lines.sort((a, b) => b.y - a.y);
    const text = lines
      .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(" "))
      .join("\n");
    return {
      pageNumber: idx + 1,
      text,
      items: items.map((it) => ({
        text: it.str ?? "",
        x: it.x ?? 0,
        y: it.y ?? 0,
        width: it.width ?? 0,
        height: it.height ?? 0,
      })),
    };
  });
}
