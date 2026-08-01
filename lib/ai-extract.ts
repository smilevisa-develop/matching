import { generateContentRotating } from "./gemini-keys";

export type ExtractedCandidate = {
  name?: string;
  englishName?: string;
  nationality?: string;
  residenceStatus?: string;
  visaExpiryDate?: string;
  birthDate?: string;
  gender?: string;
  phoneNumber?: string;
  email?: string;
  postalCode?: string;
  address?: string;
  spouseStatus?: string;
  childrenCount?: string;
  japaneseLevel?: string;
  japaneseLevelDate?: string;
  licenseName?: string;
  licenseExpiryDate?: string;
  otherQualificationName?: string;
  otherQualificationExpiryDate?: string;
  traineeExperience?: string;
  highSchoolName?: string;
  highSchoolStartDate?: string;
  highSchoolEndDate?: string;
  universityName?: string;
  universityStartDate?: string;
  universityEndDate?: string;
  workExperiences?: {
    companyName?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  }[];
  motivation?: string;
  selfIntroduction?: string;
  japanPurpose?: string;
  currentJob?: string;
  retirementReason?: string;
  preferenceNote?: string;
  /** 抽出時の検証で除外された値や、AI が不確実とした値の警告メッセージ */
  _warnings?: string[];
};

export type SourceFile = {
  fileName: string;
  mimeType: string;
  base64: string;
};

export type ExtractedJobPosting = {
  title?: string;
  jobDescription?: string;
  workLocation?: string;
  nearestStation?: string;
  headcount?: string;
  gender?: string;
  nationality?: string;
  workTime1Start?: string;
  workTime1End?: string;
  workTime2Start?: string;
  workTime2End?: string;
  overtime?: string;
  avgMonthlyOvertime?: string;
  fixedOvertimeHours?: string;
  fixedOvertimePay?: string;
  monthlyGross?: string;
  basicSalary?: string;
  salaryCalcMethod?: string;
  perfectAttendance?: string;
  housingAllowance?: string;
  nightShiftAllowance?: string;
  commuteAllowance?: string;
  socialInsurance?: string;
  employmentInsurance?: string;
  healthInsurance?: string;
  pensionInsurance?: string;
  incomeTax?: string;
  residentTax?: string;
  mealProvision?: string;
  mealAmount?: string;
  dormProvision?: string;
  dormAmount?: string;
  utilitiesProvision?: string;
  utilitiesAmount?: string;
  holidays?: string;
  otherBenefits?: string;
  notes?: string;
};

const EXTRACTION_SCHEMA_DESCRIPTION = `次のJSONスキーマに沿って、読み取れた情報のみを出力してください。

【重要ルール】
1. 読み取れない / 不確実な項目は **省略** してください (null/undefined/空文字列を含めない)。
2. 履歴書のラベルが下記スキーマのキーと完全一致しない場合でも、意味的に明らかに同じなら正しいキーに割り当ててください。エイリアス一覧を後述します。
3. 意味が曖昧で、複数のフィールドにまたがりうる値は、**省略してください** (推測でデータを入れない)。
4. 同じ意味の値が複数の書類から見つかったら、公式な書類 (在留カード > パスポート > 履歴書) の値を優先。
5. 日付は YYYY-MM-DD 形式で正規化。和暦は西暦に変換。月のみで日が不明な場合は YYYY-MM-01 とせず省略。
6. workExperiences は古い順の配列。

【フィールド定義 + エイリアス】

- name: 候補者のカナ表記 (例: "グエン ヴァン アン")
  エイリアス: "カナ", "フリガナ", "氏名(カナ)", "ふりがな"
  ※ 漢字氏名は除外 (これは englishName でも name でもない)

- englishName: ローマ字 / アルファベット表記 (例: "NGUYEN VAN AN")
  エイリアス: "英字氏名", "ローマ字", "Name", "Full Name", "English name"

- nationality: 国名の日本語 ("ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ", "その他")
  エイリアス: "国籍", "Nationality", "出身国"

- residenceStatus: "技能実習", "特定技能1号", "特定技能2号", "技術・人文知識・国際業務" のいずれか
  エイリアス: "在留資格", "Status of Residence"

- visaExpiryDate: 在留資格の有効期限 YYYY-MM-DD
  エイリアス: "在留期限", "ビザ期限", "Date of Expiration"

- birthDate: 生年月日 YYYY-MM-DD
  エイリアス: "生年月日", "誕生日", "Date of Birth", "DOB"

- gender: "男性", "女性", "その他"
  エイリアス: "性別", "Sex", "Gender"

- phoneNumber: 本人の電話 (携帯)
  エイリアス: "電話番号", "携帯番号", "TEL", "Phone", "携帯", "連絡先"
  ※ 緊急連絡先や保証人の電話とは別なので注意。混在しているなら本人の方だけ抽出。

- email: 本人のメールアドレス
  エイリアス: "メール", "E-mail", "メールアドレス", "Email"
  ※ "@" を含むことを必ず確認。

- postalCode: 郵便番号 (NNN-NNNN 形式)
  エイリアス: "〒", "郵便番号", "Postal Code", "Zip"

- address: 日本国内の住所
  エイリアス: "現住所", "住所", "Address"
  ※ 母国の住所は除外 (日本での住所のみ)。

- spouseStatus: "有" or "無" (配偶者の有無)
  エイリアス: "配偶者", "婚姻状況", "Marital Status"

- childrenCount: 子供の人数を数字の文字列 (例: "2")
  エイリアス: "子の数", "Children"

- japaneseLevel: 日本語レベル (例: "JLPT N3", "N2")
  エイリアス: "日本語能力", "日本語検定", "JLPT", "JFT", "日本語レベル"

- japaneseLevelDate: 日本語検定の取得日 YYYY-MM-DD

- licenseName: 自動車免許など (例: "普通自動車第一種免許")
  エイリアス: "免許", "Driver's License"

- licenseExpiryDate: 免許の有効期限 YYYY-MM-DD

- otherQualificationName: その他の資格名 (技能検定、フォークリフト等)
  エイリアス: "資格", "Certificate"

- otherQualificationExpiryDate: その他の資格の有効期限 YYYY-MM-DD

- traineeExperience: 実習経験 / 過去の在留歴
  エイリアス: "技能実習経験", "Trainee experience", "在留歴"

- highSchoolName: 高校名 / Senior High School

- highSchoolStartDate / highSchoolEndDate: 高校の入学・卒業年月 YYYY-MM-DD

- universityName: 大学名 / 専門学校名 / カレッジ名

- universityStartDate / universityEndDate: 大学等の入学・卒業年月 YYYY-MM-DD

- workExperiences: 職歴 [{companyName, startDate, endDate, reason}]
  各オブジェクト: companyName=勤務先名、startDate=開始 YYYY-MM-DD、endDate=終了 YYYY-MM-DD (現職なら省略)、reason=退職理由

- motivation: 志望動機 (なぜ弊社の求人に応募したか)

- selfIntroduction: 自己紹介 / 自己 PR

- japanPurpose: 来日目的 (なぜ日本で働きたいか)

- currentJob: 現在の仕事内容

- retirementReason: 退職理由 (現職を辞めた理由 / 辞めたい理由)

- preferenceNote: 本人希望記入欄 (希望勤務地、希望給与など)

【迷ったときの判断ガイド】
- ラベルが上記エイリアスのどれにも該当しない場合は、そのフィールドは省略。
- 1 つの値が複数のフィールド候補に該当しうる場合 (例: "番号" だけ書いてある) は省略。
- 数字や日付の形式が崩れていて整合性が取れない場合は省略。`;

const SYSTEM_PROMPT = `あなたは外国人人材の書類から候補者情報を抽出するアシスタントです。
日本語の履歴書、在留カード、パスポート、送り出し機関が作成した候補者プロフィールなどの画像やPDFから、構造化されたJSONを抽出してください。

以下の JSON オブジェクト 1つだけを返してください。コードブロックや説明文は不要です。
複数の書類から同じ項目が見つかった場合は、最も公式な書類(在留カード > パスポート > 履歴書)の値を優先してください。
自信のない値は含めないでください。

${EXTRACTION_SCHEMA_DESCRIPTION}`;

const SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function isSupported(mime: string) {
  return SUPPORTED_IMAGE_MIMES.has(mime) || mime === "application/pdf";
}

function unsupportedMimeHint(mimes: string[]) {
  if (mimes.some((mime) => mime === "image/heic" || mime === "image/heif")) {
    return "HEIC / HEIF 画像はそのままでは読み取れません。iPhone の写真は JPEG に変換してからアップロードしてください。";
  }
  return `未対応の形式が含まれています: ${mimes.join(", ")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorToText(error: unknown): string {
  if (error instanceof Error) {
    const details: string[] = [error.message];
    const extra = error as Error & { status?: number; cause?: unknown; response?: { status?: number; data?: unknown } };
    if (extra.status) details.push(`status=${extra.status}`);
    if (extra.response?.status) details.push(`response.status=${extra.response.status}`);
    if (extra.response?.data) {
      try {
        details.push(`response.data=${typeof extra.response.data === "string" ? extra.response.data : JSON.stringify(extra.response.data)}`);
      } catch {
        // ignore
      }
    }
    if (extra.cause && extra.cause !== error) details.push(`cause=${String(extra.cause)}`);
    return details.join(" | ");
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function mapGeminiError(raw: string): string {
  if (/\bAPI_KEY_INVALID\b|\bAPI key not valid\b|\bInvalid API key\b/i.test(raw)) {
    return "Gemini API キーが無効です。Railway の GEMINI_API_KEY を確認してください。";
  }
  if (/\b403\b|\bPERMISSION_DENIED\b|\bSERVICE_DISABLED\b/i.test(raw)) {
    return "Gemini API の利用権限がありません (403)。Google Cloud コンソールで Generative Language API / Vertex AI API が有効化されているか、請求情報の紐付けを確認してください。";
  }
  if (/\b404\b|model.*not found|NOT_FOUND/i.test(raw)) {
    return "指定された Gemini モデルが見つかりません (404)。GEMINI_MODEL の値 (例: gemini-2.5-flash) を確認してください。";
  }
  if (/\bUNAUTHENTICATED\b|\b401\b/i.test(raw)) {
    return "Gemini への認証に失敗しました (401)。GEMINI_API_KEY を再発行してください。";
  }
  if (/UNAVAILABLE|\b503\b/i.test(raw)) {
    return "Google の AI サーバーが混雑しています (503)。数十秒〜数分待ってからもう一度お試しください。";
  }
  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(raw)) {
    return "Gemini のレート制限 / クォータに達しました。少し時間を置いてから再度お試しください (必要に応じて有料プランへの引き上げも検討してください)。";
  }
  if (/INVALID_ARGUMENT|\b400\b/i.test(raw)) {
    return `Gemini が入力を受け付けませんでした (400)。ファイルサイズが大きすぎる/形式がサポート外の可能性があります。詳細: ${raw}`;
  }
  if (/DEADLINE_EXCEEDED|timeout|ETIMEDOUT/i.test(raw)) {
    return "AI の応答が時間内に返ってきませんでした。ファイル数を減らすか少し経ってから再試行してください。";
  }
  if (/fetch failed|ENETUNREACH|ECONNRESET|ECONNREFUSED|getaddrinfo/i.test(raw)) {
    return `Gemini へのネットワーク接続に失敗しました。詳細: ${raw}`;
  }
  // 未分類: 生メッセージを返して調査できるようにする
  return `AI 抽出中にエラーが発生しました。詳細: ${raw}`;
}

// 503 UNAVAILABLE / 429 RESOURCE_EXHAUSTED の時だけ指数バックオフでリトライ
async function callGeminiWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = errorToText(error);
      console.error(`[gemini] attempt ${i + 1}/${attempts} failed:`, message);
      const retryable =
        message.includes("UNAVAILABLE") ||
        message.includes("503") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("429") ||
        message.includes("DEADLINE_EXCEEDED");
      if (!retryable || i === attempts - 1) break;
      await sleep(1500 * Math.pow(2, i));
    }
  }
  const raw = errorToText(lastError);
  throw new Error(mapGeminiError(raw));
}

export async function extractCandidateFromFiles(files: SourceFile[]): Promise<ExtractedCandidate> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が未設定です");
  }

  const supportedFiles = files.filter((file) => isSupported(file.mimeType));
  if (supportedFiles.length === 0) {
    throw new Error(unsupportedMimeHint(files.map((file) => file.mimeType)));
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts: {
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }[] = [
    { text: SYSTEM_PROMPT },
    ...supportedFiles.map((file) => ({
      inlineData: { mimeType: file.mimeType, data: file.base64 },
    })),
    {
      text: "添付した書類から候補者情報を抽出して、指定のスキーマに沿う JSON を一つだけ返してください。説明や Markdown コードブロックは一切不要です。",
    },
  ];

  const response = await callGeminiWithRetry(() =>
    generateContentRotating({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })
  );

  const text = response.text?.trim() ?? "";
  const raw = parseJsonPayload(text);
  return validateExtractedCandidate(raw);
}

/**
 * 添付ファイルを AI に見せて、各ファイルがどの書類種別か分類させる。
 * classifyByFileName でファイル名から判定できなかったファイルの後段フォールバック。
 *
 * 入力: files (mimeType + base64)
 * 返り値: 各ファイルの index に対応する { kind, confidence, reasoning }
 *   kind は ALL_DOCUMENT_KINDS の kind 文字列、判定不可なら "unknown"
 */
export type AiFileClassification = {
  index: number;
  kind: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
};

const KIND_CATALOG_FOR_PROMPT = [
  { kind: "photo", label: "顔写真 (人物の顔がはっきり写った証明写真)" },
  { kind: "residence-card", label: "在留カード (表面 - 個人情報と写真)" },
  { kind: "residence-card-back", label: "在留カード (裏面 - 資格変更履歴等)" },
  { kind: "passport", label: "パスポート (旅券)" },
  { kind: "resume", label: "履歴書 (Rirekisho / CV)" },
  { kind: "career-history", label: "職務経歴書" },
  { kind: "jlpt-certificate", label: "JLPT (日本語能力試験) 合格証書" },
  { kind: "driver-license", label: "運転免許証" },
  { kind: "trainee-evaluation", label: "実習生評価書 / 終了証明書 / 専門級・随時3級" },
  { kind: "skill-test-certificate", label: "技能検定の合格証書 (特定技能評価試験など)" },
  { kind: "designation-letter", label: "指定書 (在留資格関連)" },
  { kind: "tokutei-2-certificate", label: "特定技能2号 合格資格" },
  { kind: "graduation-prospect", label: "卒業見込み" },
  { kind: "graduation-certificate", label: "卒業証明書" },
  { kind: "transcript", label: "成績証明書" },
  { kind: "transcript-jp", label: "成績証明書 (日本語版)" },
  { kind: "transcript-original", label: "成績証明書 (原版・海外卒業者)" },
  { kind: "student-id", label: "学生証" },
  { kind: "other", label: "その他 (上記いずれにも該当しない)" },
];

export async function classifyFilesByAi(files: SourceFile[]): Promise<AiFileClassification[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");
  const supportedFiles = files.filter((file) => isSupported(file.mimeType));
  if (supportedFiles.length === 0) return [];

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const catalogText = KIND_CATALOG_FOR_PROMPT.map(
    (k) => `  - ${k.kind}: ${k.label}`,
  ).join("\n");

  const parts: {
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }[] = [
    {
      text:
        "あなたは書類分類アシスタントです。添付された複数の書類ファイルについて、各ファイルの書類種別を判定してください。\n\n" +
        `使用可能な種別 (kind) は以下のみです:\n${catalogText}\n\n` +
        "指示:\n" +
        "- 添付ファイルの順に、index 0 から順番に分類してください\n" +
        "- kind は必ず上記の kind 文字列のいずれかにしてください (判定不能なら other)\n" +
        "- confidence は high / medium / low の 3 段階\n" +
        "- reasoning に判定理由を短く日本語で書いてください\n\n" +
        "出力は次のスキーマの JSON 配列だけを返してください (説明不要):\n" +
        '[ { "index": 0, "kind": "resume", "confidence": "high", "reasoning": "..." }, ... ]',
    },
    ...supportedFiles.map((file, i) => ({
      inlineData: {
        mimeType: file.mimeType,
        data: file.base64,
      },
      // 参考: ファイル名は本文には入れず、AI には順序だけ意識させる
      // (index i と supportedFiles[i] の対応を維持)
      // 変数 i の未使用警告回避
      ...(i >= 0 ? {} : {}),
    })),
    { text: "以上のファイルを分類してください。" },
  ];

  const response = await callGeminiWithRetry(() =>
    generateContentRotating({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  );

  const text = response.text?.trim() ?? "";
  try {
    const parsed = parseJsonPayload(text);
    if (!Array.isArray(parsed)) return [];
    const results: AiFileClassification[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const index = typeof r.index === "number" ? r.index : Number(r.index);
      if (!Number.isFinite(index)) continue;
      const kind = typeof r.kind === "string" ? r.kind : "other";
      const conf = r.confidence;
      const confidence: "high" | "medium" | "low" =
        conf === "high" || conf === "medium" || conf === "low" ? conf : "medium";
      const item: AiFileClassification = { index, kind, confidence };
      if (typeof r.reasoning === "string") item.reasoning = r.reasoning;
      results.push(item);
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * docx 等から事前にテキスト抽出した文字列を Gemini に渡して JSON 化する。
 * 履歴書 PDF/画像と違って画像 OCR は使わないので、レイアウトの細かい情報は失われる。
 */
export async function extractCandidateFromText(text: string): Promise<ExtractedCandidate> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");
  const trimmed = text?.trim();
  if (!trimmed) throw new Error("テキストが空です");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts = [
    { text: SYSTEM_PROMPT },
    { text: "以下のテキスト (docx などから抽出した履歴書本文) から候補者情報を抽出して、指定のスキーマに沿う JSON を一つだけ返してください。説明や Markdown コードブロックは一切不要です。" },
    { text: trimmed },
  ];

  const response = await callGeminiWithRetry(() =>
    generateContentRotating({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })
  );

  const out = response.text?.trim() ?? "";
  const raw = parseJsonPayload(out);
  return validateExtractedCandidate(raw);
}

/**
 * AI が返した候補者データを検証し、形式不正のフィールドは除去 + 警告を返す。
 * これで「曖昧なラベルを AI が誤って解釈した結果が、フォームに直接入る」事故を防ぐ。
 */
function validateExtractedCandidate(raw: ExtractedCandidate): ExtractedCandidate {
  const warnings: string[] = [];
  const cleaned: ExtractedCandidate = { ...raw };

  const isYmd = (v?: string): boolean =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  // 日付フィールドは YYYY-MM-DD でなければ除外
  const dateFields: (keyof ExtractedCandidate)[] = [
    "visaExpiryDate",
    "birthDate",
    "japaneseLevelDate",
    "licenseExpiryDate",
    "otherQualificationExpiryDate",
    "highSchoolStartDate",
    "highSchoolEndDate",
    "universityStartDate",
    "universityEndDate",
  ];
  for (const k of dateFields) {
    const v = cleaned[k];
    if (typeof v === "string" && v.trim() && !isYmd(v)) {
      warnings.push(`${k}: "${v}" は日付形式が不正のため除外`);
      delete cleaned[k];
    }
  }

  // 電話番号: 数字を 7 文字以上含まなければ除外
  if (cleaned.phoneNumber) {
    const digits = cleaned.phoneNumber.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      warnings.push(`phoneNumber: "${cleaned.phoneNumber}" は数字桁数が不適のため除外`);
      delete cleaned.phoneNumber;
    }
  }

  // メール: @ を含まなければ除外
  if (cleaned.email) {
    if (!/@/.test(cleaned.email) || cleaned.email.length < 5) {
      warnings.push(`email: "${cleaned.email}" は @ を含まないため除外`);
      delete cleaned.email;
    }
  }

  // 郵便番号: 数字 7 桁を含まなければ除外
  if (cleaned.postalCode) {
    const digits = cleaned.postalCode.replace(/\D/g, "");
    if (digits.length !== 7) {
      warnings.push(`postalCode: "${cleaned.postalCode}" は 7 桁数字ではないため除外`);
      delete cleaned.postalCode;
    }
  }

  // 国籍: 既知の値以外は除外
  const knownNationalities = [
    "ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ",
    "中国", "ネパール", "スリランカ", "カンボジア", "バングラデシュ",
    "モンゴル", "ウズベキスタン", "日本", "その他",
  ];
  if (cleaned.nationality && !knownNationalities.includes(cleaned.nationality)) {
    warnings.push(`nationality: "${cleaned.nationality}" は既知国籍ではないため "その他" に正規化`);
    cleaned.nationality = "その他";
  }

  // 在留資格: 既知の値以外は除外
  const knownResidence = [
    "技能実習", "特定技能1号", "特定技能2号", "技術・人文知識・国際業務",
    "留学生", "特定活動", "永住", "持っていない", "不明",
  ];
  if (cleaned.residenceStatus && !knownResidence.includes(cleaned.residenceStatus)) {
    warnings.push(`residenceStatus: "${cleaned.residenceStatus}" は既知の値ではないため除外`);
    delete cleaned.residenceStatus;
  }

  // 性別: 既知の値以外は除外
  const knownGenders = ["男性", "女性", "その他"];
  if (cleaned.gender && !knownGenders.includes(cleaned.gender)) {
    // M/F や male/female などの簡易マッピング
    const g = cleaned.gender.toUpperCase();
    if (g === "M" || g.includes("MALE")) cleaned.gender = "男性";
    else if (g === "F" || g.includes("FEMALE")) cleaned.gender = "女性";
    else {
      warnings.push(`gender: "${cleaned.gender}" は不明のため除外`);
      delete cleaned.gender;
    }
  }

  // 配偶者: 有/無/Yes/No/married/single 系を正規化
  if (cleaned.spouseStatus) {
    const s = cleaned.spouseStatus.toLowerCase();
    if (s.includes("有") || s.includes("married") || s.includes("yes") || s === "1") {
      cleaned.spouseStatus = "有";
    } else if (s.includes("無") || s.includes("single") || s.includes("no") || s === "0") {
      cleaned.spouseStatus = "無";
    } else {
      warnings.push(`spouseStatus: "${cleaned.spouseStatus}" は不明のため除外`);
      delete cleaned.spouseStatus;
    }
  }

  // 子供数: 数字に変換できなければ除外
  if (cleaned.childrenCount) {
    const n = Number(String(cleaned.childrenCount).replace(/\D/g, ""));
    if (Number.isFinite(n) && n >= 0 && n < 30) {
      cleaned.childrenCount = String(n);
    } else {
      warnings.push(`childrenCount: "${cleaned.childrenCount}" は数値化不能のため除外`);
      delete cleaned.childrenCount;
    }
  }

  // 職歴の各エントリは少なくとも companyName か startDate のどちらかが必要
  if (Array.isArray(cleaned.workExperiences)) {
    const filtered = cleaned.workExperiences.filter((w) => {
      if (!w.companyName && !w.startDate) return false;
      // 各日付フィールドが不正なら null 化
      if (w.startDate && !isYmd(w.startDate)) {
        warnings.push(`workExperiences.startDate: "${w.startDate}" 不正、null 化`);
        w.startDate = undefined;
      }
      if (w.endDate && !isYmd(w.endDate)) {
        warnings.push(`workExperiences.endDate: "${w.endDate}" 不正、null 化`);
        w.endDate = undefined;
      }
      return true;
    });
    cleaned.workExperiences = filtered;
  }

  // 名前は最低 1 文字
  for (const k of ["name", "englishName"] as const) {
    if (cleaned[k] && cleaned[k]!.trim().length < 1) {
      delete cleaned[k];
    }
  }

  if (warnings.length > 0) {
    cleaned._warnings = warnings;
  }
  return cleaned;
}

export const JOB_POSTING_SCHEMA = `次のJSONスキーマで求人票情報を抽出してください。読み取れない項目は含めない。金額は数字のみ(例: "180000")、期間は文字列のまま(例: "1年")で良い。

fields:
- title: 求人票のタイトル(職種+会社名など)
- jobDescription: 仕事内容
- workLocation: 勤務地(都道府県+市区町村以下)
- nearestStation: 最寄り駅
- headcount: 募集人数(数字の文字列)
- gender: 男/女/不問
- nationality: 希望国籍(不問の場合は"不問")
- workTime1Start / workTime1End: シフト1 開始/終了 "HH:MM"
- workTime2Start / workTime2End: シフト2(二交代制などある場合)
- overtime: 残業有無("有"/"無")
- avgMonthlyOvertime: 月間平均残業時間(数字の文字列, 時間)
- fixedOvertimeHours: 固定残業時間
- fixedOvertimePay: 固定残業代(円)
- monthlyGross: 月総支給額(円)
- basicSalary: 基本給(円)
- salaryCalcMethod: 給与計算方法(月給/時給)
- perfectAttendance: 皆勤手当(円)
- housingAllowance: 住宅手当(円)
- nightShiftAllowance: 深夜手当(円)
- commuteAllowance: 通勤手当(円 or "全額支給")
- socialInsurance: 社会保険料の記載(有/無/概算)
- employmentInsurance: 雇用保険料
- healthInsurance: 健康保険料
- pensionInsurance: 厚生年金保険料
- incomeTax: 所得税
- residentTax: 住民税
- mealProvision: 食費支給の有無(有/無)
- mealAmount: 食費金額(円/月)
- dormProvision: 寮の有無(有/無)
- dormAmount: 寮費金額(円/月)
- utilitiesProvision: 光熱費支給の有無(有/無)
- utilitiesAmount: 光熱費金額(円/月)
- holidays: 休日(週休2日制など)
- otherBenefits: その他手当・福利厚生
- notes: 特記事項`;

const JOB_POSTING_SYSTEM_PROMPT = `あなたは日本の求人票から項目を抽出するアシスタントです。
外国人向け求人票(特定技能・技能実習・技術人文知識国際業務など)の PDF/画像から、
構造化された JSON を 1 つだけ返してください。コードブロックや説明は不要。

${JOB_POSTING_SCHEMA}`;

/**
 * すでに整形されたテキスト (例: ChatGPT が抽出した文章 / 手元にあるテキスト形式の求人票) を
 * Gemini に渡して JSON 化する。ファイル不要。
 */
export async function extractJobPostingFromText(text: string): Promise<ExtractedJobPosting> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");
  const trimmed = text?.trim();
  if (!trimmed) throw new Error("テキストが空です");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts = [
    { text: JOB_POSTING_SYSTEM_PROMPT },
    { text: "以下のテキストから情報を抽出して、指定のスキーマに沿う JSON を一つだけ返してください。" },
    { text: trimmed },
  ];

  const response = await callGeminiWithRetry(() =>
    generateContentRotating({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })
  );

  const out = response.text?.trim() ?? "";
  return parseJsonPayloadAs<ExtractedJobPosting>(out);
}

export async function extractJobPostingFromFiles(files: SourceFile[]): Promise<ExtractedJobPosting> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が未設定です");
  }

  const supportedFiles = files.filter((file) => isSupported(file.mimeType));
  if (supportedFiles.length === 0) {
    throw new Error(unsupportedMimeHint(files.map((file) => file.mimeType)));
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts: {
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }[] = [
    { text: JOB_POSTING_SYSTEM_PROMPT },
    ...supportedFiles.map((file) => ({
      inlineData: { mimeType: file.mimeType, data: file.base64 },
    })),
    { text: "添付した求人票から情報を抽出して、指定のスキーマに沿う JSON を一つだけ返してください。" },
  ];

  const response = await callGeminiWithRetry(() =>
    generateContentRotating({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })
  );

  const text = response.text?.trim() ?? "";
  return parseJsonPayloadAs<ExtractedJobPosting>(text);
}

function parseJsonPayloadAs<T>(raw: string): T {
  if (!raw) {
    throw new Error("Gemini から空のレスポンスが返りました");
  }
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        console.error("Gemini JSON parse failed (matched object)", match[0].slice(0, 1000));
        throw new Error(
          `Gemini の返答を JSON として解釈できませんでした。返答冒頭: ${match[0]
            .slice(0, 180)
            .replace(/\s+/g, " ")}`
        );
      }
    }
    console.error("Gemini JSON parse failed (raw)", cleaned.slice(0, 1000));
    throw new Error(
      `Gemini の返答形式が想定と違います。返答冒頭: ${cleaned
        .slice(0, 180)
        .replace(/\s+/g, " ")}`
    );
  }
}

function parseJsonPayload(raw: string): ExtractedCandidate {
  if (!raw) {
    throw new Error("Gemini から空のレスポンスが返りました");
  }
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as ExtractedCandidate;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ExtractedCandidate;
      } catch {
        console.error("Gemini candidate JSON parse failed (matched object)", match[0].slice(0, 1000));
        throw new Error(
          `Gemini の返答を JSON として解釈できませんでした。返答冒頭: ${match[0]
            .slice(0, 180)
            .replace(/\s+/g, " ")}`
        );
      }
    }
    console.error("Gemini candidate JSON parse failed (raw)", cleaned.slice(0, 1000));
    throw new Error(
      `Gemini の返答形式が想定と違います。返答冒頭: ${cleaned
        .slice(0, 180)
        .replace(/\s+/g, " ")}`
    );
  }
}
