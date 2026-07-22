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
};

export default nextConfig;
