import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAdmin } from "@/lib/auth";

/**
 * data/candidates-master.json を読んで、既存 Person の欠損フィールドだけを埋める。
 * - 既に値が入っているフィールドは絶対に上書きしない
 * - DB に居ない ID はスキップ (sync-candidates-from-drive で先に作成しておく)
 *
 * クエリ:
 *   ?ids=90,91,...   ... 指定 ID のみ対象
 *   ?onlyMissing=1   ... デフォルト動作 (空欄のみ埋める)
 *   ?overwrite=1     ... 既に値があっても上書きする (注意)
 */

type MasterRow = {
  id: number;
  englishName: string | null;
  katakanaName: string | null;
  partner: string | null;
  nationality: string | null;
  residenceStatus: string | null;
  birthDate: string | null;
  postalCode: string | null;
  prefecture: string | null;
  address: string | null;
  driveFolderUrl: string | null;
  gender: string | null;
  visaExpiryDate: string | null;
  japaneseLevel: string | null;
  traineeExperience: string | null;
  preferenceNote: string | null;
  field: string | null;
};

type FormRow = {
  katakanaName: string | null;
  englishName: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  residenceStatus: string | null;
  visaExpiryDate: string | null;
  traineeExperience: string | null;
  spouseStatus: string | null;
  childrenCount: string | null;
  postalCode: string | null;
  address: string | null;
  phoneNumber: string | null;
  email: string | null;
  highSchoolName: string | null;
  highSchoolStartDate: string | null;
  highSchoolEndDate: string | null;
  licenseName: string | null;
  licenseExpiryDate: string | null;
  qualification1: string | null;
  qualificationDate1: string | null;
  motivation: string | null;
  selfIntroduction: string | null;
  japanPurpose: string | null;
  currentJob: string | null;
  retirementReason: string | null;
  workExperiences: { companyName: string; startDate: string; endDate: string; content: string; reason: string }[];
  photoUrl: string | null;
  driveFolderUrl: string | null;
};

function loadMaster(): { master: MasterRow[]; formByKana: Record<string, FormRow> } {
  const file = path.join(process.cwd(), "data", "candidates-master.json");
  const raw = readFileSync(file, "utf-8");
  return JSON.parse(raw);
}

function normalizeNationality(value: string | null) {
  if (!value) return null;
  const known = ["ベトナム", "インドネシア", "ミャンマー", "フィリピン", "タイ", "韓国", "ネパール", "カンボジア"];
  for (const n of known) if (value.includes(n)) return n;
  return value;
}

function normalizeResidenceStatus(value: string | null) {
  if (!value) return null;
  // 実習生 / 技能実習生 → 技能実習
  if (value.includes("技能実習") || value.includes("実習")) return "技能実習";
  if (value.includes("特定技能1") || value.includes("特定技能一")) return "特定技能1号";
  if (value.includes("特定技能2") || value.includes("特定技能二")) return "特定技能2号";
  if (value.includes("技術") || value.includes("技人国")) return "技術・人文知識・国際業務";
  return value;
}

async function resolvePartnerId(partnerName: string | null): Promise<number | null> {
  if (!partnerName) return null;
  const needle = partnerName.trim();
  let p = await prisma.partner.findFirst({
    where: { OR: [{ name: needle }, { name: { contains: needle } }] },
    select: { id: true },
  });
  if (!p) {
    p = await prisma.partner.create({ data: { name: needle }, select: { id: true } });
  }
  return p.id;
}

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const url = new URL(req.url);
    const overwrite = url.searchParams.get("overwrite") === "1";
    const idsParam = url.searchParams.get("ids");
    const targetIds = idsParam
      ? idsParam.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n))
      : null;

    const { master, formByKana } = loadMaster();
    // 英語名でも form を引けるようにインデックスを構築
    const formByEnglish = new Map<string, FormRow>();
    for (const [, row] of Object.entries(formByKana)) {
      const en = row.englishName?.trim();
      if (en) formByEnglish.set(en.toUpperCase(), row);
    }

    // master に居る ID + master に居なくても DB に居る ID (form だけでも補完したい)
    const targets: Array<MasterRow | { id: number }> = targetIds
      ? targetIds.map((id) => master.find((m) => m.id === id) ?? { id })
      : master;

    const log: string[] = [];
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    let missingFromMaster = 0;

    // 指定 ID で master.json に無いものを最初に通知 (元の xlsx に居ない)
    if (targetIds) {
      const masterIds = new Set(master.map((m) => m.id));
      for (const id of targetIds) {
        if (!masterIds.has(id)) {
          missingFromMaster++;
          log.push(`⚠️ id=${id}: data/candidates-master.json に該当行がありません (xlsx の master シートに居ない)`);
        }
      }
    }

    // 既存 Person を一括取得
    const existing = await prisma.person.findMany({
      where: { id: { in: targets.map((t) => t.id) } },
      include: { onboarding: true, resumeProfile: true },
    });
    const byId = new Map(existing.map((p) => [p.id, p]));

    for (const row of targets) {
      // row は MasterRow か bare {id} のいずれか
      const masterRow: Partial<MasterRow> = "katakanaName" in row ? row : {};
      const person = byId.get(row.id);
      if (!person) {
        notFound++;
        log.push(`⚠️ id=${row.id}: 候補者が DB に居ません (sync-candidates-from-drive を先に実行)`);
        continue;
      }

      // sync-candidates-from-drive で入る仮プレースホルダ。これらは「空」として扱う
      const PERSON_PLACEHOLDER: Record<string, string[]> = {
        nationality: ["不明", "未設定"],
        residenceStatus: ["技能実習"],
        channel: ["LINE"],
      };
      const isEffectivelyEmpty = (key: string, current: unknown) => {
        if (current === null || current === undefined || current === "") return true;
        const placeholders = PERSON_PLACEHOLDER[key];
        if (placeholders && typeof current === "string" && placeholders.includes(current)) {
          return true;
        }
        return false;
      };

      // master シートからの基本情報
      const partnerId = await resolvePartnerId(masterRow.partner ?? null);
      const personUpdate: Record<string, unknown> = {};
      const setIfEmpty = (key: keyof typeof person, value: unknown) => {
        if (value === null || value === undefined || value === "") return;
        const current = person[key];
        if (overwrite || isEffectivelyEmpty(key as string, current)) {
          personUpdate[key] = value;
        }
      };

      // 履歴書フォーム (form) を、master のカタカナ→英語→現在の name の順で解決
      const kanaForLookup = masterRow.katakanaName ?? person.name;
      let formMatch: FormRow | undefined;
      if (kanaForLookup && formByKana[kanaForLookup]) formMatch = formByKana[kanaForLookup];
      if (!formMatch && kanaForLookup) {
        const partial = Object.entries(formByKana).find(
          ([k]) =>
            k && (k.startsWith(kanaForLookup.slice(0, 3)) || kanaForLookup.startsWith(k.slice(0, 3)))
        );
        if (partial) formMatch = partial[1];
      }
      // 英語名で form をフォールバック検索 (master に居ないが form に英語名がある人向け)
      const englishForLookup =
        masterRow.englishName ?? person.onboarding?.englishName ?? person.name;
      if (!formMatch && englishForLookup) {
        const fromEnglish = formByEnglish.get(englishForLookup.trim().toUpperCase());
        if (fromEnglish) formMatch = fromEnglish;
      }

      // form から取れた英語名/カタカナ名も master が無い時のフォールバックに使う
      const effectiveKatakana = masterRow.katakanaName ?? formMatch?.katakanaName ?? null;
      const effectiveEnglish =
        masterRow.englishName ?? formMatch?.englishName ?? person.onboarding?.englishName ?? null;

      // Person.name はカタカナ名が正。
      // - 現在の name が空 → カタカナ名 (なければ英語名) を入れる
      // - 現在の name が英語名と一致 (sync-from-drive の仮値) → カタカナ名で上書き
      if (effectiveKatakana) {
        const englishMatchesCurrent =
          effectiveEnglish && person.name && person.name.trim() === effectiveEnglish.trim();
        if (overwrite || !person.name || englishMatchesCurrent) {
          personUpdate.name = effectiveKatakana;
        }
      } else if (effectiveEnglish && !person.name) {
        personUpdate.name = effectiveEnglish;
      }
      // master を優先しつつ form にある値で埋める
      setIfEmpty(
        "nationality",
        normalizeNationality(masterRow.nationality ?? formMatch?.nationality ?? null)
      );
      setIfEmpty(
        "residenceStatus",
        normalizeResidenceStatus(masterRow.residenceStatus ?? formMatch?.residenceStatus ?? null)
      );
      if (partnerId !== null && (overwrite || person.partnerId === null)) {
        personUpdate.partnerId = partnerId;
      }
      if (masterRow.driveFolderUrl && (overwrite || !person.driveFolderUrl)) {
        personUpdate.driveFolderUrl = masterRow.driveFolderUrl;
      }

      if (Object.keys(personUpdate).length > 0) {
        await prisma.person.update({ where: { id: person.id }, data: personUpdate });
      }

      // onboarding (基本住所等)
      const address =
        [masterRow.prefecture, masterRow.address].filter(Boolean).join(" ").trim() || null;
      const onboarding = person.onboarding;
      const onboardingUpdate: Record<string, unknown> = {};
      const setOnboardingIfEmpty = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === "") return;
        const current = onboarding ? (onboarding as unknown as Record<string, unknown>)[key] : null;
        if (overwrite || !current) {
          onboardingUpdate[key] = value;
        }
      };
      setOnboardingIfEmpty("englishName", masterRow.englishName ?? formMatch?.englishName);
      setOnboardingIfEmpty("birthDate", masterRow.birthDate ?? formMatch?.birthDate);
      setOnboardingIfEmpty(
        "address",
        address || formMatch?.address || null
      );
      setOnboardingIfEmpty("postalCode", masterRow.postalCode ?? formMatch?.postalCode);

      // resumeProfile (基本情報の続き + master の派生)
      const resume = person.resumeProfile;
      const resumeUpdate: Record<string, unknown> = {};
      const setResumeIfEmpty = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === "") return;
        const current = resume ? (resume as unknown as Record<string, unknown>)[key] : null;
        if (overwrite || !current) {
          resumeUpdate[key] = value;
        }
      };
      setResumeIfEmpty("gender", masterRow.gender ?? formMatch?.gender);
      setResumeIfEmpty(
        "country",
        normalizeNationality(masterRow.nationality ?? formMatch?.nationality ?? null)
      );
      setResumeIfEmpty(
        "visaType",
        normalizeResidenceStatus(masterRow.residenceStatus ?? formMatch?.residenceStatus ?? null)
      );
      setResumeIfEmpty("visaExpiryDate", masterRow.visaExpiryDate ?? formMatch?.visaExpiryDate);
      setResumeIfEmpty("japaneseLevel", masterRow.japaneseLevel);
      setResumeIfEmpty(
        "traineeExperience",
        masterRow.traineeExperience ?? formMatch?.traineeExperience
      );
      if (masterRow.preferenceNote) {
        setResumeIfEmpty("preferenceNote", `現職の手取り額: ${masterRow.preferenceNote}`);
      }
      if (masterRow.field) {
        setResumeIfEmpty("remarks", `分野: ${masterRow.field}`);
      }

      // 履歴書フォーム (英語名 or カタカナ名で照合) からの追加情報
      if (formMatch) {
        setOnboardingIfEmpty("phoneNumber", formMatch.phoneNumber);
        setIfEmpty("email", formMatch.email);
        setResumeIfEmpty("spouseStatus", formMatch.spouseStatus);
        setResumeIfEmpty("childrenCount", formMatch.childrenCount);
        setResumeIfEmpty("highSchoolName", formMatch.highSchoolName);
        setResumeIfEmpty("highSchoolStartDate", formMatch.highSchoolStartDate);
        setResumeIfEmpty("highSchoolEndDate", formMatch.highSchoolEndDate);
        setResumeIfEmpty("licenseName", formMatch.licenseName);
        setResumeIfEmpty("licenseExpiryDate", formMatch.licenseExpiryDate);
        setResumeIfEmpty("otherQualificationName", formMatch.qualification1);
        setResumeIfEmpty("otherQualificationExpiryDate", formMatch.qualificationDate1);
        setResumeIfEmpty("motivation", formMatch.motivation);
        setResumeIfEmpty("selfIntroduction", formMatch.selfIntroduction);
        setResumeIfEmpty("japanPurpose", formMatch.japanPurpose);
        setResumeIfEmpty("currentJob", formMatch.currentJob);
        setResumeIfEmpty("retirementReason", formMatch.retirementReason);
        if (formMatch.workExperiences && formMatch.workExperiences.length > 0) {
          setResumeIfEmpty("workExperiences", formMatch.workExperiences);
        }
      }

      // email を Person 本体に書く処理は setIfEmpty で済ませてあるので personUpdate を再適用
      if (Object.keys(personUpdate).length > 0) {
        await prisma.person.update({ where: { id: person.id }, data: personUpdate });
      }
      if (Object.keys(onboardingUpdate).length > 0) {
        if (onboarding) {
          await prisma.personOnboarding.update({
            where: { personId: person.id },
            data: onboardingUpdate,
          });
        } else {
          await prisma.personOnboarding.create({
            data: {
              personId: person.id,
              status: "submitted",
              ...onboardingUpdate,
            },
          });
        }
      }
      if (Object.keys(resumeUpdate).length > 0) {
        if (resume) {
          await prisma.resumeProfile.update({
            where: { personId: person.id },
            data: resumeUpdate,
          });
        } else {
          await prisma.resumeProfile.create({
            data: {
              personId: person.id,
              ...resumeUpdate,
            },
          });
        }
      }

      const total =
        Object.keys(personUpdate).length +
        Object.keys(onboardingUpdate).length +
        Object.keys(resumeUpdate).length;
      if (total === 0) {
        skipped++;
        log.push(`= id=${row.id}: 既に揃っているのでスキップ`);
      } else {
        updated++;
        log.push(`✅ id=${row.id} ${effectiveKatakana ?? effectiveEnglish ?? ""}: ${total} 項目を補完`);
      }
    }

    return Response.json({
      ok: true,
      summary: {
        total: targets.length,
        requestedIds: targetIds?.length ?? null,
        missingFromMaster,
        updated,
        skipped,
        notFound,
        overwrite,
      },
      log,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: err instanceof AuthError ? err.status : 500 }
    );
  }
}
