"use client";

import Image from "next/image";
import { useState } from "react";
import { extractDriveFileId } from "@/lib/drive-url";

/**
 * Drive の URL はブラウザから直接読めないので、うちの proxy 経由に書き換える。
 * 表示サイズを sz で渡し、必要な大きさのサムネイルだけ取得する
 * (一覧には数十枚並ぶため、原本を落とすと非常に重くなる)。
 */
function toDisplayUrl(url: string | null | undefined, size: number): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/photo-proxy")) return url;
  if (url.includes("drive.google.com")) {
    const id = extractDriveFileId(url);
    // Retina 対応で 2 倍の解像度を要求する
    if (id) return `/api/photo-proxy?id=${id}&sz=${Math.round(size * 2)}`;
  }
  return url;
}

/**
 * 候補者の写真表示。
 * - photoUrl があれば表示。読み込みに失敗したら自動でアイコンにフォールバック
 * - photoUrl が無ければ最初から人型 SVG アイコンを表示
 *
 * イニシャル文字 (名前の頭文字) は出さず、人型シルエットのみ。
 */
export default function PersonAvatar({
  photoUrl,
  name,
  size = 40,
  className = "",
}: {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const displayUrl = toDisplayUrl(photoUrl, size);
  const showImage = !!displayUrl && !failed;

  const radius = Math.max(8, Math.round(size * 0.25));
  const wrapperStyle = { width: size, height: size, borderRadius: radius };

  if (showImage) {
    return (
      <Image
        src={displayUrl!}
        alt={name ?? ""}
        width={size}
        height={size}
        unoptimized
        onError={() => setFailed(true)}
        style={wrapperStyle}
        className={`shrink-0 object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={wrapperStyle}
      className={`flex shrink-0 items-center justify-center border border-gray-200 bg-[var(--color-light)] text-[var(--color-primary)] ${className}`}
      aria-label={name ?? "候補者"}
    >
      <svg
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </div>
  );
}
