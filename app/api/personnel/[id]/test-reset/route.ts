/**
 * テスト用候補者 (ID:280「テストさん」) 専用のリセット / サンプル投入 (要ログイン)。
 *
 * POST /api/personnel/[id]/test-reset
 *   body: { action: "clear" | "fill" }
 *
 * 本番環境でフォーム送信テストを繰り返すための道具。
 *   - clear: プロフィール情報を消して「追加したて」の空状態に戻す
 *            (onboarding / resumeProfile / japaneseCheck を削除, 顔写真をクリア)
 *   - fill : サンプル情報を投入して「入力済み」の状態にする
 *
 * 安全のため ID:280 以外では動作しない (誤操作で実候補者を消さないため)。
 * name / intakeToken / 連絡先紐づけ / パートナー等の identity は保持する。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** この ID の候補者だけ操作を許可する (本番のテスト専用アカウント) */
const TEST_PERSON_ID = 280;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();

    const { id } = await ctx.params;
    const personId = Number(id);
    if (personId !== TEST_PERSON_ID) {
      return Response.json(
        { ok: false, error: "この操作はテスト用候補者 (ID:280) でのみ使用できます" },
        { status: 403 },
      );
    }

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) {
      return Response.json({ ok: false, error: "候補者が見つかりません" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "clear") {
      // 関連プロフィールを削除して「追加したて」の空状態へ
      await prisma.personJapaneseCheck.deleteMany({ where: { personId } });
      await prisma.resumeProfile.deleteMany({ where: { personId } });
      await prisma.personOnboarding.deleteMany({ where: { personId } });
      await prisma.person.update({ where: { id: personId }, data: { photoUrl: null } });
      return Response.json({ ok: true, action: "clear" });
    }

    if (action === "fill") {
      // サンプル情報を投入 (顔写真・日本語チェックは実データが要るので投入しない)
      await prisma.personOnboarding.upsert({
        where: { personId },
        create: {
          personId,
          englishName: "Test Taro",
          fullNameKana: "テスト タロウ",
          birthDate: "1998/05/10",
          phoneNumber: "090-1234-5678",
          postalCode: "123-4567",
          address: "東京都新宿区テスト1-2-3 テストマンション101",
          status: "draft",
        },
        update: {
          englishName: "Test Taro",
          fullNameKana: "テスト タロウ",
          birthDate: "1998/05/10",
          phoneNumber: "090-1234-5678",
          postalCode: "123-4567",
          address: "東京都新宿区テスト1-2-3 テストマンション101",
        },
      });

      const resumeData = {
        gender: "男性",
        spouseStatus: "未婚",
        childrenCount: "0",
        visaExpiryDate: "2027/03/31",
        japaneseLevel: "N3",
        japaneseLevelDate: "2024/12",
        traineeExperience: "有",
        motivation: "日本の高い技術を学び、母国の家族を支えたいと思い志望しました。",
        selfIntroduction: "はじめまして。テスト タロウと申します。真面目に頑張ります。",
        japanPurpose: "技術を身につけて長く日本で働きたいです。",
        currentJob: "工場での製造・組み立て作業",
        retirementReason: "より専門的な仕事に挑戦したいため。",
        preferenceNote: "製造・農業を希望。夜勤も可能です。",
        highSchoolName: "テスト高等学校",
        interviewAnswers: {
          desiredWorkLocation: "関東（東京・神奈川・埼玉）",
          desiredWorkYears: "5年以上",
        },
      };
      await prisma.resumeProfile.upsert({
        where: { personId },
        create: { personId, ...resumeData },
        update: resumeData,
      });

      return Response.json({ ok: true, action: "fill" });
    }

    return Response.json({ ok: false, error: "action は clear / fill のいずれか" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
