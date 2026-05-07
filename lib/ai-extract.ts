import { GoogleGenAI } from "@google/genai";

export type ExtractedCandidate = {
  name?: string;
  englishName?: string;
  nationality?: string;
  residenceStatus?: string;
  visaExpiryDate?: string;
  birthDate?: string;
  gender?: string;
  phoneNumber?: string;
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

const EXTRACTION_SCHEMA_DESCRIPTION = `次のJSONスキーマに沿って、読み取れた情報のみを出力してください。読み取れない項目は省略(null/undefined/空文字列を含めない)。日付は YYYY-MM-DD 形式で正規化してください。workExperiences は配列で、古い順。

fields:
- name: 候補者のカナ表記(例: "グエン ヴァン アン")
- englishName: アルファベット表記
- nationality: 国名の日本語(例: "ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ", "その他")
- residenceStatus: "技能実習", "特定技能1号", "特定技能2号", "技術・人文知識・国際業務" のいずれか
- visaExpiryDate: 在留資格の有効期限 YYYY-MM-DD
- birthDate: 生年月日 YYYY-MM-DD
- gender: "男性", "女性", "その他"
- phoneNumber: 電話番号
- postalCode: 郵便番号
- address: 住所(日本国内の住所があれば)
- spouseStatus: "有" or "無"
- childrenCount: 子供の人数を数字の文字列
- japaneseLevel: 日本語レベル(例: "JLPT N3")
- japaneseLevelDate: 取得日 YYYY-MM-DD
- licenseName: 免許の名前
- licenseExpiryDate: YYYY-MM-DD
- otherQualificationName: その他の資格名
- otherQualificationExpiryDate: YYYY-MM-DD
- traineeExperience: 実習経験の有無や内容
- highSchoolName: 高校名
- highSchoolStartDate / highSchoolEndDate: YYYY-MM-DD
- universityName: 大学名
- universityStartDate / universityEndDate: YYYY-MM-DD
- workExperiences: [{companyName, startDate, endDate, reason}]
- motivation: 志望動機
- selfIntroduction: 自己紹介
- japanPurpose: 来日目的
- currentJob: 現在の仕事
- retirementReason: 退職理由
- preferenceNote: 本人希望記入欄`;

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
  const client = new GoogleGenAI({ apiKey });

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
    client.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    })
  );

  const text = response.text?.trim() ?? "";
  return parseJsonPayload(text);
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
  const client = new GoogleGenAI({ apiKey });

  const parts = [
    { text: JOB_POSTING_SYSTEM_PROMPT },
    { text: "以下のテキストから情報を抽出して、指定のスキーマに沿う JSON を一つだけ返してください。" },
    { text: trimmed },
  ];

  const response = await callGeminiWithRetry(() =>
    client.models.generateContent({
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
  const client = new GoogleGenAI({ apiKey });

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
    client.models.generateContent({
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
