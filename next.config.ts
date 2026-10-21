import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // unpdf / pdf-parse / pdfjs-dist は Node.js 側で require させる。
  // バンドラに含めると "Cannot find module pdf.worker.mjs" や ENOENT が出るため。
  serverExternalPackages: ["unpdf", "pdf-parse", "pdfjs-dist"],
  // 親ディレクトリ (Desktop 等) に別の package.json があると
  // Next がワークスペースルートを誤検出して tailwindcss を解決できなくなる。
  // このプロジェクト自身をルートとして固定する。
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // AI取込 (履歴書・在留カードの写真や PDF を base64 で送る) は 10MB を超えることがある。
    // 既定の 10MB だと途中で切れて 500 になっていた (2026/10/21 候補者 429)
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
