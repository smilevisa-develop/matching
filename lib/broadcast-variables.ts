/**
 * 一斉連絡テンプレートの変数システム。
 *
 * テンプレート本文中の {{変数名}} を、配信時に各受信者・現在のデータで展開する。
 *
 * 急ぎ判定は Deal.status のステージで行う:
 *   - 至急募集 → {{急ぎ案件一覧}} に入る
 *   - 募集中 / 至急募集 → {{募集中案件一覧}} に入る
 */

export type BroadcastVariable = {
  /** {{}}内に書く名前 */
  key: string;
  /** UI 表示用ラベル */
  label: string;
  /** 説明 (テンプレ編集画面のツールチップ) */
  description: string;
  /** 分類タグ */
  category: "受信者" | "案件";
};

export const BROADCAST_VARIABLES: BroadcastVariable[] = [
  {
    key: "パートナー名",
    label: "{{パートナー名}}",
    description: "受信パートナーの会社名",
    category: "受信者",
  },
  {
    key: "担当者名",
    label: "{{担当者名}}",
    description: "受信パートナーの担当者名",
    category: "受信者",
  },
  {
    key: "拠点国",
    label: "{{拠点国}}",
    description: "受信パートナーの拠点国",
    category: "受信者",
  },
  {
    key: "急ぎ案件一覧",
    label: "{{急ぎ案件一覧}}",
    description: "ステージが「至急募集」の案件を箇条書きで挿入",
    category: "案件",
  },
  {
    key: "募集中案件一覧",
    label: "{{募集中案件一覧}}",
    description: "ステージが「募集中」または「至急募集」の案件を箇条書きで挿入",
    category: "案件",
  },
];

/** {{募集中案件一覧}} に含めるステージ */
export const OPEN_DEAL_STATUSES = ["募集中", "至急募集"] as const;
/** {{急ぎ案件一覧}} に含めるステージ */
export const URGENT_DEAL_STATUSES = ["至急募集"] as const;

export type DealForBroadcast = {
  id: number;
  title: string;
  companyName: string;
  status: string;
  field: string | null;
  workLocation: string | null;
  basicSalary: string | null;
  deadline: Date | null;
};

export type PartnerForBroadcast = {
  name: string;
  contactName: string | null;
  country: string | null;
  introducibleFields: string | null; // CSV
};

/** Deal 1 件を 1 行にフォーマット: 案件ID / 分野 / 勤務地 / 基本給 / 〆締切 */
function formatDealLine(d: DealForBroadcast): string {
  const parts: string[] = [`#${d.id}`];
  if (d.field) parts.push(`分野: ${d.field}`);
  if (d.workLocation) parts.push(`勤務地: ${d.workLocation}`);
  if (d.basicSalary) parts.push(`基本給: ${d.basicSalary}`);
  if (d.deadline) {
    const dl = new Date(d.deadline);
    parts.push(`〆${dl.getFullYear()}/${dl.getMonth() + 1}/${dl.getDate()}`);
  }
  return parts.join(" / ");
}

function formatDealList(deals: DealForBroadcast[]): string {
  if (deals.length === 0) return "(該当する案件はありません)";
  // 各案件の間に空行を入れて見やすく
  return deals.map(formatDealLine).join("\n\n");
}

/**
 * テンプレート本文の {{xxx}} を実データで展開する。
 *
 * partner.introducibleFields があれば、案件をその分野で絞る。
 */
export function expandTemplate(
  content: string,
  ctx: {
    partner: PartnerForBroadcast;
    /** ステージが 募集中 または 至急募集 の案件 (両方含む) */
    openDeals: DealForBroadcast[];
    /** ステージが 至急募集 の案件のみ */
    urgentDeals: DealForBroadcast[];
  }
): string {
  const { partner, urgentDeals, openDeals } = ctx;

  const partnerFields = (partner.introducibleFields ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const filteredOpen =
    partnerFields.length > 0
      ? openDeals.filter((d) => !d.field || partnerFields.includes(d.field))
      : openDeals;
  const filteredUrgent =
    partnerFields.length > 0
      ? urgentDeals.filter((d) => !d.field || partnerFields.includes(d.field))
      : urgentDeals;

  const replacements: Record<string, string> = {
    パートナー名: partner.name,
    担当者名: partner.contactName ?? "",
    拠点国: partner.country ?? "",
    急ぎ案件一覧: formatDealList(filteredUrgent),
    募集中案件一覧: formatDealList(filteredOpen),
  };

  return content.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (match, key: string) => {
    if (key in replacements) return replacements[key];
    return match; // 未知の変数はそのまま残す
  });
}

/** プレビュー用: ダミーパートナー */
export const PREVIEW_PARTNER: PartnerForBroadcast = {
  name: "(パートナー名)",
  contactName: "(担当者名)",
  country: "(拠点国)",
  introducibleFields: null,
};

/**
 * Prisma の Deal レコード (conditions Json 含む) を DealForBroadcast に変換。
 * workLocation / basicSalary は Deal.conditions Json から取り出す。
 */
export function dealToBroadcast(d: {
  id: number;
  title: string;
  status: string;
  field: string | null;
  deadline: Date | null;
  conditions: unknown;
  company: { name: string };
}): DealForBroadcast {
  const cond = (d.conditions ?? {}) as Record<string, unknown>;
  const pick = (k: string): string | null => {
    const v = cond[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    id: d.id,
    title: d.title,
    companyName: d.company.name,
    status: d.status,
    field: d.field,
    workLocation: pick("workLocation"),
    basicSalary: pick("basicSalary"),
    deadline: d.deadline,
  };
}
