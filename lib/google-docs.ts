import { google } from "googleapis";

const DOC_URL_RE = /\/document\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_FOLDER_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
const SHEETS_URL_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

// 候補者・企業のルートフォルダ (env で上書き可能、未設定時はこの既定値を使用)
const DEFAULT_PERSON_ROOT_FOLDER_URL =
  "https://drive.google.com/drive/folders/1Pmv-hFyk8DKIuu24mtMS5c26DWXmjqXr";
const DEFAULT_COMPANY_ROOT_FOLDER_URL =
  "https://drive.google.com/drive/folders/1TEqGDtoQZlLU8bg8c4cWZSNDp7mRwbin";

export function parseGoogleDocId(urlOrId: string) {
  const value = urlOrId.trim();
  const match = value.match(DOC_URL_RE);
  return match?.[1] ?? value;
}

export function parseGoogleDriveFolderId(urlOrId: string) {
  const value = urlOrId.trim();
  const match = value.match(DRIVE_FOLDER_RE);
  return match?.[1] ?? value;
}

/**
 * Google Sheets / Docs / 生 ID のいずれでも fileId を取り出す。
 * `/spreadsheets/d/<id>` `/document/d/<id>` どちらでも OK。
 */
export function parseGoogleFileId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const value = urlOrId.trim();
  const sheets = value.match(SHEETS_URL_RE);
  if (sheets) return sheets[1];
  const doc = value.match(DOC_URL_RE);
  if (doc) return doc[1];
  // 既に ID っぽい (英数字と _- のみ) ならそのまま
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
  return null;
}

function getGooglePrivateKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です");
  }
  return raw.replace(/\\n/g, "\n");
}

function getGoogleClientEmail() {
  const value = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!value) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL が未設定です");
  }
  return value;
}

async function getGoogleClients() {
  const auth = new google.auth.JWT({
    email: getGoogleClientEmail(),
    key: getGooglePrivateKey(),
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  await auth.authorize();

  return {
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
  };
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("アップロード用データが不正です");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function getOrCreateFolder({
  drive,
  parentFolderUrl,
  folderName,
}: {
  drive: Awaited<ReturnType<typeof getGoogleClients>>["drive"];
  parentFolderUrl: string;
  folderName: string;
}) {
  const parentId = parseGoogleDriveFolderId(parentFolderUrl);
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id,webViewLink",
  });

  if (!created.data.id) {
    throw new Error("Google Drive フォルダの作成に失敗しました");
  }

  return {
    folderId: created.data.id,
    folderUrl: created.data.webViewLink ?? `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

export async function createResumeDocumentFromTemplate({
  templateUrl,
  folderUrl,
  title,
  replacements,
  photoUrl,
}: {
  templateUrl: string;
  folderUrl: string;
  title: string;
  replacements: Record<string, string>;
  /** {{顔写真}} 部分に挿入する画像の URL。http(s) の公開URL推奨 (data:/drive直リンク不可) */
  photoUrl?: string | null;
}) {
  const templateId = parseGoogleDocId(templateUrl);
  const folderId = parseGoogleDriveFolderId(folderUrl);
  const { drive, docs } = await getGoogleClients();

  try {
    await drive.files.get({
      fileId: templateId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `テンプレートの Google Docs にアクセスできません。サービスアカウントへ共有されているか、ファイルIDが正しいかを確認してください。詳細: ${message}`
    );
  }

  if (folderId) {
    try {
      await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType",
        supportsAllDrives: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `保存先の Google Drive フォルダにアクセスできません。サービスアカウントへ共有されているか、Shared Drive のルートではなく実際のフォルダURLを指定しているかを確認してください。詳細: ${message}`
      );
    }
  }

  const copied = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: {
      name: title,
      parents: folderId ? [folderId] : undefined,
    },
    fields: "id,webViewLink",
  });

  const documentId = copied.data.id;
  if (!documentId) {
    throw new Error("Google Docs の複製に失敗しました");
  }

  // 1) 空グループ行の自動削除 (大学なし、職歴1件のみ等)
  // 2) 顔写真の画像挿入
  // 3) テキスト置換
  // ── 順番を守る (行削除と画像挿入は placeholder 位置を手掛かりに動くので文字置換より先)

  try {
    await pruneEmptyRowGroups({ docs, documentId, replacements });
  } catch (error) {
    console.warn("pruneEmptyRowGroups failed:", error);
  }

  if (photoUrl && /^https?:\/\//.test(photoUrl)) {
    try {
      await insertInlineImageAtPlaceholder({
        docs,
        documentId,
        placeholder: "{{顔写真}}",
        photoUrl,
      });
    } catch (error) {
      // 画像挿入の失敗は履歴書作成全体をブロックしない (テキスト置換で空文字になるだけ)
      console.warn("insertInlineImageAtPlaceholder failed:", error);
    }
  }

  const requests = Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: {
        text: `{{${key}}}`,
        matchCase: true,
      },
      replaceText: value,
    },
  }));

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  }

  // 残った未マッチ placeholder ({{xxx}}) を一括で空文字に置換 (docs から消す)
  // 履歴書/求人票テンプレに書いてあったが、データ側に対応キーが無かった残骸を消す。
  await removeUnmatchedPlaceholders({ docs, documentId });

  return {
    documentId,
    documentUrl: copied.data.webViewLink ?? `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

type DocsClient = ReturnType<typeof google.docs>;

/**
 * 置換後の Doc に残っている {{...}} (=データ側に対応キーが無かった残骸) を
 * すべて空文字に置換する。
 * Docs API の replaceAllText は正規表現を直接サポートしないので、
 * 1) documents.get で全文を取得
 * 2) /\{\{[^{}]+\}\}/g で残っている placeholder を全部抽出
 * 3) 一意な placeholder ごとに replaceAllText で空文字置換
 */
async function removeUnmatchedPlaceholders({
  docs,
  documentId,
}: {
  docs: DocsClient;
  documentId: string;
}) {
  try {
    const doc = await docs.documents.get({ documentId });
    const collected = new Set<string>();
    const walk = (elements: unknown[] | null | undefined) => {
      if (!elements) return;
      for (const el of elements as Record<string, unknown>[]) {
        const paragraph = el.paragraph as { elements?: Record<string, unknown>[] } | undefined;
        if (paragraph?.elements) {
          for (const run of paragraph.elements) {
            const tr = run.textRun as { content?: string } | undefined;
            if (!tr?.content) continue;
            const matches = tr.content.match(/\{\{[^{}]+\}\}/g);
            if (matches) for (const m of matches) collected.add(m);
          }
        }
        const table = el.table as { tableRows?: Record<string, unknown>[] } | undefined;
        if (table?.tableRows) {
          for (const row of table.tableRows) {
            const cells = row.tableCells as Record<string, unknown>[] | undefined;
            if (!cells) continue;
            for (const cell of cells) walk((cell.content as unknown[]) ?? []);
          }
        }
      }
    };
    walk(doc.data.body?.content);
    if (collected.size === 0) return;
    const requests = Array.from(collected).map((placeholder) => ({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: "",
      },
    }));
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  } catch (error) {
    console.warn("removeUnmatchedPlaceholders failed:", error);
  }
}

/**
 * 値が空のときに、テンプレの関連行ごと自動削除するグループ定義。
 * guard が空なら rowMarkers を含むテーブル行が削除される。
 *
 * テンプレ側の約束:
 *  - 「大学の 1 行」には {{大学名}} を書く (あるいは {{入学_大学}} / {{卒業_大学}})
 *  - 「職歴 N」の 2 行目に {{退社Nラベル}}、1 行目に {{会社名N}} を書く
 * → 会社名N が空なら、職歴N の 2 行 (会社名N を含む行、退社Nラベル を含む行) が同時に削除される
 */
// 各人の項目数 (職歴・資格) は大きくバラつくので、テンプレに最大 N 件分の枠を
// 置いてもらい、データが空の枠は履歴書生成時に「行ごと消す」設計にしている。
export const RESUME_MAX_WORKS = 4;
export const RESUME_MAX_CERTS = 4;

function buildResumeEmptyRowGroups(): { guard: string; rowMarkers: string[] }[] {
  const groups: { guard: string; rowMarkers: string[] }[] = [
    {
      guard: "大学名",
      // 大学名 / 学校名2 / 入学_大学 / 卒業_大学 / 入学2 / 卒業2 + 学歴1 セパレータ
      rowMarkers: [
        "大学名",
        "学校名2",
        "入学_大学",
        "卒業_大学",
        "入学2",
        "卒業2",
        "_学歴1_区切り",
      ],
    },
    {
      // その他学歴 (学校名3 / 入学3 / 卒業3 + 学歴2 セパレータ)
      guard: "学校名3",
      rowMarkers: ["学校名3", "入学3", "卒業3", "_学歴2_区切り"],
    },
    // 免許も name 空なら 1 行ごと削除
    { guard: "免許", rowMarkers: ["免許", "免許年"] },
    // 日本語検定も値が空なら専用行を削除
    { guard: "日本語検定", rowMarkers: ["日本語検定", "日本語検定取得日"] },
  ];
  for (let i = 1; i <= RESUME_MAX_WORKS; i++) {
    groups.push({
      guard: `会社名${i}`,
      // 区切り用の空セパレータ行 (guard の名前を白文字や極小フォントで隠して
      // 入れておけば、対応する職歴が空のときに改行行も一緒に消える)
      rowMarkers: [`会社名${i}`, `入社${i}`, `退社${i}`, `退社${i}ラベル`, `_職歴${i}_区切り`],
    });
  }
  for (let i = 1; i <= RESUME_MAX_CERTS; i++) {
    groups.push({
      guard: `資格${i}`,
      rowMarkers: [`資格${i}`, `資格年${i}`, `_資格${i}_区切り`],
    });
  }
  return groups;
}

const RESUME_EMPTY_ROW_GROUPS = buildResumeEmptyRowGroups();

type TableRowHit = {
  tableStartLocation: number;
  rowIndex: number;
};

/**
 * 値が空のグループ (例: 「会社名2」= 空) に属するテーブル行を自動削除する。
 * deleteTableRow は後ろから順に実行しないと rowIndex がずれるので、
 * (table, rowIndex) を全部集めてからソートして逆順に消す。
 */
async function pruneEmptyRowGroups({
  docs,
  documentId,
  replacements,
}: {
  docs: DocsClient;
  documentId: string;
  replacements: Record<string, string>;
}) {
  const emptyMarkers = new Set<string>();
  for (const group of RESUME_EMPTY_ROW_GROUPS) {
    const guardValue = (replacements[group.guard] ?? "").trim();
    if (guardValue) continue;
    for (const marker of group.rowMarkers) emptyMarkers.add(marker);
  }
  if (emptyMarkers.size === 0) return;

  const doc = await docs.documents.get({ documentId });
  const body = doc.data.body;
  if (!body?.content) return;

  const hits: TableRowHit[] = [];

  const rowContainsAnyMarker = (row: Record<string, unknown>, markers: Set<string>): boolean => {
    const cells = row.tableCells as Record<string, unknown>[] | undefined;
    if (!cells) return false;
    for (const cell of cells) {
      const content = (cell.content as Record<string, unknown>[] | undefined) ?? [];
      for (const el of content) {
        const paragraph = el.paragraph as { elements?: Record<string, unknown>[] } | undefined;
        if (!paragraph?.elements) continue;
        for (const run of paragraph.elements) {
          const tr = run.textRun as { content?: string } | undefined;
          if (!tr?.content) continue;
          for (const m of markers) {
            if (tr.content.includes(`{{${m}}}`)) return true;
          }
        }
      }
    }
    return false;
  };

  const walk = (elements: unknown[] | null | undefined) => {
    if (!elements) return;
    for (const el of elements as Record<string, unknown>[]) {
      const table = el.table as { tableRows?: Record<string, unknown>[] } | undefined;
      const startIndex = typeof el.startIndex === "number" ? el.startIndex : null;
      if (table?.tableRows && startIndex !== null) {
        table.tableRows.forEach((row, rowIndex) => {
          if (rowContainsAnyMarker(row, emptyMarkers)) {
            hits.push({ tableStartLocation: startIndex, rowIndex });
          }
        });
        // ネストしたテーブルの中も歩く
        for (const row of table.tableRows) {
          const cells = row.tableCells as Record<string, unknown>[] | undefined;
          if (!cells) continue;
          for (const cell of cells) {
            walk((cell.content as unknown[]) ?? []);
          }
        }
      }
    }
  };

  walk(body.content);

  if (hits.length === 0) return;

  // テーブルごとにまとめて、rowIndex の降順で削除 (後ろから削除しないとインデックスがずれる)
  hits.sort((a, b) => {
    if (a.tableStartLocation !== b.tableStartLocation) return b.tableStartLocation - a.tableStartLocation;
    return b.rowIndex - a.rowIndex;
  });

  const requests = hits.map((hit) => ({
    deleteTableRow: {
      tableCellLocation: {
        tableStartLocation: { index: hit.tableStartLocation },
        rowIndex: hit.rowIndex,
        columnIndex: 0,
      },
    },
  }));

  // 1 回でまとめて batchUpdate
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
}

/**
 * Google Docs 内で指定の placeholder 文字列を見つけ、そこに画像を挿入する。
 * placeholder テキストは削除してから画像が同じ位置に入る。
 */
async function insertInlineImageAtPlaceholder({
  docs,
  documentId,
  placeholder,
  photoUrl,
}: {
  docs: DocsClient;
  documentId: string;
  placeholder: string;
  photoUrl: string;
}) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data.body;
  if (!body?.content) return;

  type Hit = { startIndex: number; endIndex: number };
  const hits: Hit[] = [];

  const walkTextRuns = (elements: unknown[] | null | undefined) => {
    if (!elements) return;
    for (const el of elements as Record<string, unknown>[]) {
      const paragraph = el.paragraph as { elements?: Record<string, unknown>[] } | undefined;
      if (paragraph?.elements) {
        for (const run of paragraph.elements) {
          const tr = run.textRun as { content?: string } | undefined;
          const start = typeof run.startIndex === "number" ? run.startIndex : null;
          if (!tr?.content || start === null) continue;
          let idx = 0;
          while (true) {
            const found = tr.content.indexOf(placeholder, idx);
            if (found === -1) break;
            hits.push({
              startIndex: start + found,
              endIndex: start + found + placeholder.length,
            });
            idx = found + placeholder.length;
          }
        }
      }
      const table = el.table as { tableRows?: Record<string, unknown>[] } | undefined;
      if (table?.tableRows) {
        for (const row of table.tableRows) {
          const cells = row.tableCells as Record<string, unknown>[] | undefined;
          if (!cells) continue;
          for (const cell of cells) {
            walkTextRuns((cell.content as unknown[]) ?? []);
          }
        }
      }
    }
  };

  walkTextRuns(body.content);

  if (hits.length === 0) return;

  // 後ろから処理しないと startIndex がずれる
  hits.sort((a, b) => b.startIndex - a.startIndex);

  for (const hit of hits) {
    const requests: Record<string, unknown>[] = [
      {
        deleteContentRange: {
          range: { startIndex: hit.startIndex, endIndex: hit.endIndex },
        },
      },
      {
        insertInlineImage: {
          location: { index: hit.startIndex },
          uri: photoUrl,
          objectSize: {
            height: { magnitude: 120, unit: "PT" },
            width: { magnitude: 100, unit: "PT" },
          },
        },
      },
    ];
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
}

export function formatPersonIdPrefix(id: number) {
  return String(id).padStart(4, "0");
}

export function buildPersonFolderName(person: { id: number; englishName?: string | null; name: string }) {
  const prefix = formatPersonIdPrefix(person.id);
  const label = (person.englishName?.trim() || person.name.trim() || "候補者")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return `${prefix}_${label}`;
}

/**
 * 候補者に紐づくファイル名を {ID4桁}_{英語名 or カナ名}_{書類名} の形で組み立てる。
 * 例: 0001_KODAI TSUCHIDA_履歴書
 */
export function buildPersonAssetName({
  person,
  assetName,
}: {
  person: { id: number; englishName?: string | null; name: string };
  assetName: string;
}) {
  const prefix = formatPersonIdPrefix(person.id);
  const label = (person.englishName?.trim() || person.name.trim() || "候補者")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  const safeAsset = (assetName ?? "").replace(/[\\/:*?"<>|]/g, "").trim() || "書類";
  return `${prefix}_${label}_${safeAsset}`;
}

// 親フォルダ内で指定の名前プレフィックスで始まるフォルダを検索
export async function findFolderByPrefix({
  parentFolderUrl,
  namePrefix,
}: {
  parentFolderUrl: string;
  namePrefix: string;
}): Promise<{ folderId: string; folderUrl: string } | null> {
  const parentId = parseGoogleDriveFolderId(parentFolderUrl);
  if (!parentId) return null;
  const { drive } = await getGoogleClients();
  const escaped = namePrefix.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${escaped}' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "files(id, name, webViewLink)",
    pageSize: 20,
  });
  const files = res.data.files ?? [];
  // 厳密に namePrefix で始まるものを優先
  const match = files.find((f) => (f.name ?? "").startsWith(namePrefix)) ?? files[0];
  if (!match || !match.id) return null;
  return {
    folderId: match.id,
    folderUrl: match.webViewLink ?? `https://drive.google.com/drive/folders/${match.id}`,
  };
}

export async function ensurePersonDriveFolder({
  existingFolderUrl,
  personName,
  personId,
  rootFolderUrl,
}: {
  existingFolderUrl?: string | null;
  personName: string;
  personId?: number;
  rootFolderUrl?: string | null;
}) {
  if (existingFolderUrl?.trim()) {
    return {
      folderId: parseGoogleDriveFolderId(existingFolderUrl),
      folderUrl: existingFolderUrl,
    };
  }

  const parentFolderUrl =
    rootFolderUrl?.trim() ||
    process.env.GOOGLE_CANDIDATE_FILES_FOLDER_URL?.trim() ||
    DEFAULT_PERSON_ROOT_FOLDER_URL;
  if (!parentFolderUrl) {
    throw new Error("候補者ルートフォルダの URL が解決できません");
  }

  // Drive 上に "0033_" で始まるフォルダが既にあれば再利用
  if (personId !== undefined) {
    const prefix = formatPersonIdPrefix(personId) + "_";
    const found = await findFolderByPrefix({ parentFolderUrl, namePrefix: prefix });
    if (found) return found;
  }

  const { drive } = await getGoogleClients();
  return getOrCreateFolder({
    drive,
    parentFolderUrl,
    folderName: personName,
  });
}

// 企業フォルダ (externalId_会社名 で検索 or 新規作成)
export async function ensureCompanyDriveFolder({
  existingFolderUrl,
  externalId,
  companyName,
  rootFolderUrl,
}: {
  existingFolderUrl?: string | null;
  externalId?: string | null;
  companyName: string;
  rootFolderUrl?: string | null;
}) {
  if (existingFolderUrl?.trim()) {
    return {
      folderId: parseGoogleDriveFolderId(existingFolderUrl),
      folderUrl: existingFolderUrl,
    };
  }
  const parentFolderUrl =
    rootFolderUrl?.trim() ||
    process.env.GOOGLE_COMPANY_FILES_FOLDER_URL?.trim() ||
    DEFAULT_COMPANY_ROOT_FOLDER_URL;
  if (!parentFolderUrl) {
    throw new Error("企業ルートフォルダの URL が解決できません");
  }

  // externalId で始まる企業フォルダを検索
  if (externalId) {
    const found = await findFolderByPrefix({ parentFolderUrl, namePrefix: externalId });
    if (found) return found;
  }

  const { drive } = await getGoogleClients();
  const folderName = externalId ? `${externalId}_${companyName}` : companyName;
  return getOrCreateFolder({
    drive,
    parentFolderUrl,
    folderName,
  });
}

export async function uploadDataUrlToDrive({
  dataUrl,
  fileName,
  folderUrl,
}: {
  dataUrl: string;
  fileName: string;
  folderUrl: string;
}) {
  const { drive } = await getGoogleClients();
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const folderId = parseGoogleDriveFolderId(folderUrl);

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType,
      body: Buffer.from(buffer),
    },
    fields: "id,webViewLink",
  });

  if (!created.data.id) {
    throw new Error("Google Drive へのファイル保存に失敗しました");
  }

  return {
    fileId: created.data.id,
    fileUrl: created.data.webViewLink ?? `https://drive.google.com/file/d/${created.data.id}/view`,
    mimeType,
  };
}
