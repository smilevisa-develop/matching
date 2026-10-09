import { cleanCompanyName } from "@/lib/candidate-profile";
import { prisma } from "@/lib/prisma";
import { reconcileMessagePersonLinks } from "@/lib/message-linking";
import {
  buildPersonAssetName,
  buildPersonFolderName,
  ensurePersonDriveFolder,
  uploadDataUrlToDrive,
} from "@/lib/google-docs";

/** 保存前に職歴の会社名から「入社 / 退社」を落とす (履歴書で二重にならないように) */
function cleanWorkExperiences(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const o = entry as Record<string, unknown>;
    if (typeof o.companyName !== "string") return entry;
    return { ...o, companyName: cleanCompanyName(o.companyName) };
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id: Number(id) },
    include: {
      onboarding: true,
      documents: true,
      resumeProfile: true,
    },
  });
  if (!person) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, person });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const personId = Number(id);
    const body = await req.json();
    const documents = Array.isArray(body.documents) ? body.documents : [];
    const currentPerson = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, driveFolderUrl: true, onboarding: { select: { englishName: true } } },
    });

    if (!currentPerson) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    const englishName = body.englishName ?? currentPerson.onboarding?.englishName ?? null;
    const folderName = buildPersonFolderName({
      id: currentPerson.id,
      englishName,
      name: body.name || currentPerson.name,
    });
    const personForName = {
      id: currentPerson.id,
      englishName,
      name: body.name || currentPerson.name,
    };

    const folder = await ensurePersonDriveFolder({
      existingFolderUrl: currentPerson.driveFolderUrl,
      personId: currentPerson.id,
      personName: folderName,
    });

    const photoUpload =
      typeof body.photoUrl === "string" && body.photoUrl.startsWith("data:")
        ? await uploadDataUrlToDrive({
            dataUrl: body.photoUrl,
            fileName: buildPersonAssetName({ person: personForName, assetName: "顔写真" }),
            folderUrl: folder.folderUrl,
          })
        : null;

    type DocumentPayload = {
      kind: string;
      fileName: string;
      fileUrl: string;
      mimeType?: string | null;
      autoJudgeStatus?: string | null;
      autoJudgeNote?: string | null;
    };

    const uploadedDocuments: DocumentPayload[] = await Promise.all(
      (documents as DocumentPayload[]).map(async (document: DocumentPayload) => {
        if (!document?.kind || !document?.fileName || !document?.fileUrl) return document;
        if (typeof document.fileUrl === "string" && document.fileUrl.startsWith("data:")) {
          const ext = document.fileName.match(/\.[^.]+$/)?.[0] ?? "";
          const assetName = document.fileName.replace(/\.[^.]+$/, "");
          const uploaded = await uploadDataUrlToDrive({
            dataUrl: document.fileUrl,
            fileName: `${buildPersonAssetName({ person: personForName, assetName })}${ext}`,
            folderUrl: folder.folderUrl,
          });
          return {
            ...document,
            fileUrl: uploaded.fileUrl,
            mimeType: uploaded.mimeType,
          };
        }
        return document;
      })
    );

    // photoUrl の扱い:
    //   - 新規 data URL アップロード (photoUpload) → その URL を採用
    //   - body.photoUrl が空文字/未指定 → PhotoPanel などフォーム外で更新済みの
    //     可能性があるため DB を触らない (photoUrl フィールドを送らない)
    //   - body.photoUrl が非空文字 → その値を採用
    const photoUrlUpdate: { photoUrl?: string } = photoUpload?.fileUrl
      ? { photoUrl: photoUpload.fileUrl }
      : typeof body.photoUrl === "string" && body.photoUrl.trim().length > 0
        ? { photoUrl: body.photoUrl }
        : {};

    const person = await prisma.person.update({
      where: { id: personId },
      data: {
        name: body.name,
        ...photoUrlUpdate,
        driveFolderUrl: folder.folderUrl,
        nationality: body.nationality,
        residenceStatus: body.residenceStatus,
        partnerId: body.partnerId ? Number(body.partnerId) : null,
        channel: body.channel,
        email: body.email || null,
      },
    });

    await prisma.personOnboarding.upsert({
      where: { personId },
      create: {
        personId,
        englishName: body.englishName || null,
        birthDate: body.birthDate || null,
        phoneNumber: body.phoneNumber || null,
        postalCode: body.postalCode || null,
        address: body.address || null,
        status: "submitted",
        submittedAt: body.birthDate || body.address ? new Date() : null,
      },
      update: {
        englishName: body.englishName || null,
        birthDate: body.birthDate || null,
        phoneNumber: body.phoneNumber || null,
        postalCode: body.postalCode || null,
        address: body.address || null,
        status: body.birthDate || body.address ? "submitted" : "draft",
        submittedAt: body.birthDate || body.address ? new Date() : null,
      },
    });

    await prisma.resumeProfile.upsert({
      where: { personId },
      create: {
        personId,
        gender: body.gender || null,
        country: body.nationality || null,
        spouseStatus: body.spouseStatus || null,
        childrenCount: body.childrenCount || null,
        visaType: body.residenceStatus || null,
        visaExpiryDate: body.visaExpiryDate || null,
        workExperiences: cleanWorkExperiences(body.workExperiences) ?? [],
        motivation: body.motivation || null,
        selfIntroduction: body.selfIntroduction || null,
        japanPurpose: body.japanPurpose || null,
        currentJob: body.currentJob || null,
        retirementReason: body.retirementReason || null,
        preferenceNote: body.preferenceNote || null,
        japaneseLevel: body.japaneseLevel || null,
        japaneseLevelDate: body.japaneseLevelDate || null,
        licenseName: body.licenseName || null,
        licenseExpiryDate: body.licenseExpiryDate || null,
        otherQualificationName: body.otherQualificationName || null,
        otherQualificationExpiryDate: body.otherQualificationExpiryDate || null,
        certifications: Array.isArray(body.otherQualifications)
          ? body.otherQualifications
              .map((q: { name?: string; expiryDate?: string }) => ({
                name: (q?.name ?? "").trim(),
                expiryDate: (q?.expiryDate ?? "").trim(),
                label: (q?.name ?? "").trim(),
                date: (q?.expiryDate ?? "").trim(),
              }))
              .filter((q: { name: string; expiryDate: string }) => q.name || q.expiryDate)
          : undefined,
        traineeExperience: body.traineeExperience || null,
        // 在留資格別メモ (技能検定 / 評価試験 など)。実習経験とは別項目
        skillExamNote: body.skillExamNote === undefined ? undefined : body.skillExamNote || null,
        // string 値のみ受け入れて Json として保存
        interviewAnswers:
          body.interviewAnswers && typeof body.interviewAnswers === "object"
            ? Object.fromEntries(
                Object.entries(body.interviewAnswers as Record<string, unknown>)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
              )
            : undefined,
        highSchoolName: body.highSchoolName || null,
        highSchoolStartDate: body.highSchoolStartDate || null,
        highSchoolEndDate: body.highSchoolEndDate || null,
        universityName: body.universityName || null,
        universityStartDate: body.universityStartDate || null,
        universityEndDate: body.universityEndDate || null,
        // 3 件目以降の学歴 (高校・大学は上の専用カラム)。履歴書出力もここを見る
        educations: Array.isArray(body.educations)
          ? body.educations
              .map((e: { schoolName?: string; startDate?: string; endDate?: string }) => ({
                schoolName: (e?.schoolName ?? "").trim(),
                startDate: (e?.startDate ?? "").trim(),
                endDate: (e?.endDate ?? "").trim(),
              }))
              .filter(
                (e: { schoolName: string; startDate: string; endDate: string }) =>
                  e.schoolName || e.startDate || e.endDate,
              )
          : undefined,
      },
      update: {
        gender: body.gender || null,
        country: body.nationality || null,
        spouseStatus: body.spouseStatus || null,
        childrenCount: body.childrenCount || null,
        visaType: body.residenceStatus || null,
        visaExpiryDate: body.visaExpiryDate || null,
        workExperiences: cleanWorkExperiences(body.workExperiences) ?? [],
        motivation: body.motivation || null,
        selfIntroduction: body.selfIntroduction || null,
        japanPurpose: body.japanPurpose || null,
        currentJob: body.currentJob || null,
        retirementReason: body.retirementReason || null,
        preferenceNote: body.preferenceNote || null,
        japaneseLevel: body.japaneseLevel || null,
        japaneseLevelDate: body.japaneseLevelDate || null,
        licenseName: body.licenseName || null,
        licenseExpiryDate: body.licenseExpiryDate || null,
        otherQualificationName: body.otherQualificationName || null,
        otherQualificationExpiryDate: body.otherQualificationExpiryDate || null,
        certifications: Array.isArray(body.otherQualifications)
          ? body.otherQualifications
              .map((q: { name?: string; expiryDate?: string }) => ({
                name: (q?.name ?? "").trim(),
                expiryDate: (q?.expiryDate ?? "").trim(),
                label: (q?.name ?? "").trim(),
                date: (q?.expiryDate ?? "").trim(),
              }))
              .filter((q: { name: string; expiryDate: string }) => q.name || q.expiryDate)
          : undefined,
        traineeExperience: body.traineeExperience || null,
        // 在留資格別メモ (技能検定 / 評価試験 など)。実習経験とは別項目
        skillExamNote: body.skillExamNote === undefined ? undefined : body.skillExamNote || null,
        // string 値のみ受け入れて Json として保存
        interviewAnswers:
          body.interviewAnswers && typeof body.interviewAnswers === "object"
            ? Object.fromEntries(
                Object.entries(body.interviewAnswers as Record<string, unknown>)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
              )
            : undefined,
        highSchoolName: body.highSchoolName || null,
        highSchoolStartDate: body.highSchoolStartDate || null,
        highSchoolEndDate: body.highSchoolEndDate || null,
        universityName: body.universityName || null,
        universityStartDate: body.universityStartDate || null,
        universityEndDate: body.universityEndDate || null,
        // 3 件目以降の学歴 (高校・大学は上の専用カラム)。履歴書出力もここを見る
        educations: Array.isArray(body.educations)
          ? body.educations
              .map((e: { schoolName?: string; startDate?: string; endDate?: string }) => ({
                schoolName: (e?.schoolName ?? "").trim(),
                startDate: (e?.startDate ?? "").trim(),
                endDate: (e?.endDate ?? "").trim(),
              }))
              .filter(
                (e: { schoolName: string; startDate: string; endDate: string }) =>
                  e.schoolName || e.startDate || e.endDate,
              )
          : undefined,
      },
    });

    for (const document of uploadedDocuments) {
      if (!document?.kind || !document?.fileUrl || !document?.fileName) continue;

      await prisma.portalDocument.upsert({
        where: {
          personId_kind: {
            personId,
            kind: document.kind,
          },
        },
        create: {
          personId,
          kind: document.kind,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          mimeType: document.mimeType || null,
          autoJudgeStatus: document.autoJudgeStatus || "accepted",
          autoJudgeNote: document.autoJudgeNote || "管理画面から更新",
        },
        update: {
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          mimeType: document.mimeType || null,
          autoJudgeStatus: document.autoJudgeStatus || "accepted",
          autoJudgeNote: document.autoJudgeNote || "管理画面から更新",
        },
      });
    }

    await reconcileMessagePersonLinks();
    return Response.json({ ok: true, person });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const person = await prisma.person.update({
      where: { id: Number(id) },
      data: body,
    });
    await reconcileMessagePersonLinks();
    return Response.json({ ok: true, person });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.person.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
