import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf / pdf-parse / pdfjs-dist は Node.js 側で require させる。
  // バンドラに含めると "Cannot find module pdf.worker.mjs" や ENOENT が出るため。
  serverExternalPackages: ["unpdf", "pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
