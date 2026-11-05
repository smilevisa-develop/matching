/** SNS の媒体 (表示順・色)。サーバー側 (page) とクライアント側 (グラフ) の両方から使う */
export const PLATFORMS = [
  { key: "youtube", label: "YouTube", color: "#D23A2F" },
  { key: "facebook", label: "Facebook", color: "#1D6FD6" },
  { key: "instagram", label: "Instagram", color: "#B5338A" },
  { key: "tiktok", label: "TikTok", color: "#B07D10" },
] as const;
export type PlatformKey = (typeof PLATFORMS)[number]["key"];
