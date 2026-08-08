/**
 * テスト用候補者 (ID:2「テストさん」) 専用のリセット / サンプル投入 (要ログイン)。
 *
 * POST /api/personnel/[id]/test-reset
 *   body: { action: "clear" | "fill" }
 *
 * 本番環境でフォーム送信テストを繰り返すための道具。
 *   - clear: プロフィール情報を消して「追加したて」の空状態に戻す
 *            (onboarding / resumeProfile / japaneseCheck を削除, 顔写真をクリア)
 *   - fill : サンプル情報 (基本情報・詳細情報すべて + 日本語チェックのデモ) を投入して
 *            「入力済み」の状態にする
 *
 * 安全のため ID:2 以外では動作しない (誤操作で実候補者を消さないため)。
 * name / intakeToken / 連絡先紐づけ / パートナー等の identity は保持する。
 */

import { prisma } from "@/lib/prisma";
import { AuthError, requireApiAccount } from "@/lib/auth";
import { JAPANESE_CHECK_QUESTIONS } from "@/lib/japanese-check-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** この ID の候補者だけ操作を許可する (本番のテスト専用アカウント) */
const TEST_PERSON_ID = 2;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireApiAccount();

    const { id } = await ctx.params;
    const personId = Number(id);
    if (personId !== TEST_PERSON_ID) {
      return Response.json(
        { ok: false, error: "この操作はテスト用候補者 (ID:2) でのみ使用できます" },
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
      await prisma.jobChecklistDelivery.deleteMany({ where: { personId } });
      await prisma.resumeProfile.deleteMany({ where: { personId } });
      await prisma.personOnboarding.deleteMany({ where: { personId } });
      // 案件紐づけも解除して推薦先を完全に未設定へ (残っていると推薦先が案件由来で残る)
      await prisma.dealCandidate.deleteMany({ where: { personId } });
      await prisma.person.update({
        where: { id: personId },
        data: {
          photoUrl: null,
          recommendedCompany: null,
          // 日本語チェックの専用リンクも失効させ、完全な「追加したて」に戻す
          japaneseCheckToken: null,
        },
      });
      return Response.json({ ok: true, action: "clear" });
    }

    if (action === "fill") {
      // ── 基本情報 (onboarding) をすべて投入 ──
      const onboardingData = {
        englishName: "Test Taro",
        fullNameKana: "テスト タロウ",
        birthDate: "1998/05/10",
        phoneNumber: "090-1234-5678",
        postalCode: "123-4567",
        address: "東京都新宿区テスト1-2-3 テストマンション101",
        emergencyContactName: "テスト ハナコ",
        emergencyContactPhone: "090-8765-4321",
        emergencyRelationship: "姉",
      };
      await prisma.personOnboarding.upsert({
        where: { personId },
        create: { personId, status: "draft", ...onboardingData },
        update: onboardingData,
      });

      // ── 詳細情報タブの面接項目をすべて投入 (interviewAnswers) ──
      const interviewAnswers: Record<string, string> = {
        currentLocation: "海外",
        japanArrivalDate: "2025/09 予定",
        employmentStatus: "在職中",
        desiredWorkYears: "5年以上",
        futurePlan: "現場のリーダーを目指したいです。",
        preferredLocation: "関東（東京・神奈川・埼玉）",
        sameJobExperience: "はい、3年あります。",
        workChallenge: "納期に間に合わせるため作業手順を工夫しました。",
        teamworkExperience: "5人のチームで協力して生産目標を達成しました。",
        physicalConfidence: "はい、体力には自信があります。",
        overtimeAcceptable: "はい、可能です。",
        currentSalary: "月 250,000円",
        currentOvertimeHours: "月 20時間",
        currentTakeHome: "月 210,000円",
        desiredTakeHome: "月 200,000円以上",
        drivingLicensePlan: "取得予定",
        japaneseLearningDuration: "2年",
        japaneseLearningMethod: "学校とアプリで勉強しています。",
        kanaReading: "ひらがな・カタカナは読めます。",
        tokuteiTestStatus: "特定技能1号評価試験 合格",
        pastJapanWorkExperience: "なし",
        longTermIntent: "はい、長く働きたいです。",
        homeReturnPlan: "当面は帰国予定はありません。",
        strengths: "真面目で、最後まで責任を持ってやり遂げます。",
        weaknesses: "慎重すぎることがありますが、確認を徹底しています。",
        mistakeResponse: "すぐに報告して、原因を確認し再発を防ぎます。",
        stressManagement: "運動と睡眠でリフレッシュします。",
        exerciseHabit: "週2回ジョギングをしています。",
        jobUnderstanding: "製造ラインでの組み立て・検査だと理解しています。",
        movingCostReady: "はい、準備できます。",
        noMovingSupportOk: "はい、問題ありません。",
        flightCostSelf: "はい、自己負担できます。",
        availableStartDate: "2025/10 から可能",
        childPlan: "当面は予定なし",
        familySupport: "家族は応援してくれています。",
        interviewAvailability: "平日午後が希望です。",
        inPersonInterview: "オンライン希望",
        otherInterviews: "なし",
        companyInquiry: "寮の有無を知りたいです。",
        candidateQuestions: "配属先はどこになりますか？",
      };

      // ── 履歴書プロフィール (resumeProfile) をすべて投入 ──
      const resumeData = {
        gender: "男性",
        country: "ミャンマー",
        spouseStatus: "未婚",
        childrenCount: "0",
        visaType: "特定技能1号",
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
        licenseName: "普通自動車免許（母国）",
        highSchoolName: "テスト高等学校",
        highSchoolStartDate: "2013/06",
        highSchoolEndDate: "2016/03",
        universityName: "テスト大学",
        universityStartDate: "2016/06",
        universityEndDate: "2020/03",
        interviewAnswers,
      };
      await prisma.resumeProfile.upsert({
        where: { personId },
        create: { personId, ...resumeData },
        update: resumeData,
      });

      // ── 日本語チェックのデモ結果を投入 (録音音声なしのダミー判定) ──
      const demoTranscripts: Record<string, string> = {
        read_aloud:
          "私は日本で働きたいです。毎日、日本語を勉強しています。仕事のときは、安全に気をつけます。分からないことは、すぐに先輩に聞きます。",
        self_intro:
          "はじめまして。テスト タロウです。ミャンマーから来ました。工場で三年、働きました。よろしくお願いします。",
        daily_qa: "きのうは、朝、掃除をしました。それから、友達と買い物に行きました。夜は日本語を勉強しました。",
        work_scenario:
          "はい、すぐに先輩に報告します。すみませんでしたと謝って、どうすればいいか聞きます。同じ失敗をしないように、メモをします。",
        explain_past:
          "一番大変だったのは、納期が近いときです。仕事が多くて、時間がありませんでした。だから、チームで手順を考えて、みんなで協力しました。",
      };
      const demoRecordings = JAPANESE_CHECK_QUESTIONS.map((q) => ({
        key: q.key,
        question: q.prompt,
        transcript: demoTranscripts[q.key] ?? "",
        driveFileId: null,
        driveFileUrl: null,
        mimeType: "audio/webm",
        seconds: q.seconds,
      }));
      const jcDemo = {
        estimatedLevel: "N3 相当",
        pronunciation: 3,
        fluency: 3,
        vocabulary: 4,
        grammar: 3,
        confidence: "高",
        summary:
          "【デモ】N3 相当（確からしさ: 高）。現場の指示と報告は概ね可能。接客や電話は練習が必要です。",
        levelReason:
          "【デモ】使えた録音 5/5 件 / 聞き取れた割合 平均 82% / 音読の正確さ 88% / 話す速さ 2.9 拍/秒 → 発音3・流暢さ3・語彙4・文法3（重みづけ総合 3.2）から N3 相当。",
        evidence: {
          perQuestion: demoRecordings.map((r) => ({
            key: r.key,
            question: r.question,
            transcript: r.transcript,
            audioIssue: "none",
            intelligibility: 82,
            taskAchieved: "full",
            grammarErrorCount: 1,
            grammarErrorExamples: [],
            hesitationCount: 1,
            vocabLevel: 4,
            readingAccuracy: r.key === "read_aloud" ? 88 : null,
            mora: 40,
            seconds: 20,
            moraPerSec: 2.9,
            usable: true,
          })),
          metrics: {
            usableCount: demoRecordings.length,
            totalQuestions: demoRecordings.length,
            intelligibilityAvg: 82,
            readingAccuracy: 88,
            freeMoraTotal: 160,
            moraPerSecAvg: 2.9,
            grammarErrorPer100Mora: 2.5,
            hesitationPer100Mora: 2.5,
            achievementRate: 1,
            composite: 3.2,
          },
          appliedRules: ["【デモ】実際の判定ではここに適用ルールが入ります"],
        },
        recordings: demoRecordings,
        assessedAt: new Date(),
      };
      await prisma.personJapaneseCheck.upsert({
        where: { personId },
        create: { personId, ...jcDemo },
        update: jcDemo,
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
