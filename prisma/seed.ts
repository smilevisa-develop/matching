import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/database-url";
import { DEFAULT_FIXED_QUESTIONS } from "../lib/app-settings";
import { hashPasscode } from "../lib/auth";

const connectionString = getDatabaseUrl();

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.dealCandidate.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.resumeDocument.deleteMany();
  await prisma.resumeProfile.deleteMany();
  await prisma.resumeTemplate.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.company.deleteMany();
  await prisma.onboardingFormQuestion.deleteMany();
  await prisma.onboardingFormTemplate.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageTemplate.deleteMany();
  await prisma.messageLog.deleteMany();
  await prisma.lineProfile.deleteMany();
  await prisma.messengerProfile.deleteMany();
  await prisma.portalTask.deleteMany();
  await prisma.portalDocument.deleteMany();
  await prisma.personOnboarding.deleteMany();
  await prisma.person.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.coreSettings.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.staffAccount.deleteMany();

  await prisma.staffAccount.createMany({
    data: [
      {
        loginId: "tsuchida",
        name: "土田",
        role: "admin",
        passcodeHash: hashPasscode("111111"),
      },
      {
        loginId: "nguyet",
        name: "グェット",
        role: "member",
        passcodeHash: hashPasscode("123456"),
      },
      {
        loginId: "thuy",
        name: "トゥイ",
        role: "member",
        passcodeHash: hashPasscode("123456"),
      },
      {
        loginId: "cindy",
        name: "チンディ",
        role: "member",
        passcodeHash: hashPasscode("123456"),
      },
    ],
  });

  const accounts = await prisma.staffAccount.findMany({ orderBy: { id: "asc" } });
  const admin = accounts.find((account) => account.loginId === "tsuchida");

  await prisma.coreSettings.create({
    data: {
      id: 1,
      fixedQuestions: DEFAULT_FIXED_QUESTIONS,
    },
  });

  await prisma.appSettings.createMany({
    data: accounts.map((account) => ({
      accountId: account.id,
      calendarLabel: `${account.name}カレンダー`,
      calendarEmbedUrl: "",
    })),
  });

  await prisma.person.createMany({
    data: [
      {
        name: "グエン・ヴァン・アン",
        nationality: "ベトナム",
        department: "候補者プール",
        residenceStatus: "技能実習",
        channel: "LINE",
        lineUserId: "U10000000000000000000000000000001",
      },
      {
        name: "シティ・ラフマ",
        nationality: "インドネシア",
        department: "候補者プール",
        residenceStatus: "特定技能1号",
        channel: "Messenger",
        messengerPsid: "psid-demo-0002",
      },
      {
        name: "アウン・モー",
        nationality: "ミャンマー",
        department: "候補者プール",
        residenceStatus: "特定技能2号",
        channel: "LINE",
        lineUserId: "U10000000000000000000000000000003",
      },
      {
        name: "マリア・サントス",
        nationality: "フィリピン",
        department: "候補者プール",
        residenceStatus: "技術・人文知識・国際業務",
        channel: "mail",
        email: "maria.santos@example.com",
      },
      {
        name: "チャノン・スパチャイ",
        nationality: "タイ",
        department: "候補者プール",
        residenceStatus: "特定技能1号",
        channel: "WhatsApp",
        whatsappId: "whatsapp-demo-0005",
      },
      {
        name: "リー・メイ",
        nationality: "中国",
        department: "候補者プール",
        residenceStatus: "技術・人文知識・国際業務",
        channel: "LINE",
        lineUserId: "U10000000000000000000000000000006",
      },
    ],
  });

  const persons = await prisma.person.findMany({
    orderBy: { id: "asc" },
  });

  await prisma.personOnboarding.createMany({
    data: [
      {
        personId: persons[0].id,
        englishName: "NGUYEN VAN AN",
        birthDate: "1999-05-10",
        phoneNumber: "090-1111-2222",
        postalCode: "260-0013",
        address: "千葉県千葉市中央区中央1-1-1",
        status: "submitted",
        submittedAt: new Date(),
      },
      {
        personId: persons[1].id,
        englishName: "SITI RAHMA",
        birthDate: "1998-11-03",
        phoneNumber: "080-3333-4444",
        postalCode: "136-0071",
        address: "東京都江東区亀戸2-2-2",
        status: "submitted",
        submittedAt: new Date(),
      },
    ],
  });

  await prisma.resumeProfile.createMany({
    data: [
      {
        personId: persons[0].id,
        gender: "男性",
        country: "ベトナム",
        spouseStatus: "無",
        childrenCount: "0",
        visaType: "技能実習",
        visaExpiryDate: "2027-03-31",
        workExperiences: [
          {
            companyName: "ABC Factory",
            startDate: "2018-05-01",
            endDate: "2024-01-31",
            reason: "より条件の良い環境で働くため",
          },
        ],
        motivation: "日本で製造技術を学び、長く安定して働きたいです。",
        selfIntroduction: "真面目で周囲と協力しながら仕事を進めることが得意です。",
        japanPurpose: "日本のものづくりを学び、家族を支えたいです。",
        currentJob: "工場で金属加工の仕事をしています。",
        retirementReason: "より条件の良い環境でスキルアップしたいため。",
        preferenceNote: "寮付き、残業は月20時間程度まで希望。",
        japaneseLevel: "JLPT N3",
        japaneseLevelDate: "2022-06-01",
        licenseName: "フォークリフト",
        licenseExpiryDate: "2028-09-30",
        traineeExperience: "技能実習3年",
        highSchoolName: "ハノイ工業高校",
        highSchoolStartDate: "2015-04-01",
        highSchoolEndDate: "2018-03-31",
      },
    ],
  });

  const linePersons = persons.filter((person) => person.lineUserId);
  const messengerPersons = persons.filter((person) => person.messengerPsid);

  await prisma.lineProfile.createMany({
    data: linePersons.map((person) => ({
      lineUserId: person.lineUserId!,
      displayName: person.name,
      lastMessageText: "よろしくお願いします",
      lastWebhookType: "message",
      lastSeenAt: new Date(),
    })),
  });

  await prisma.messengerProfile.createMany({
    data: messengerPersons.map((person) => ({
      psid: person.messengerPsid!,
      lastMessageText: "Messengerで連絡しました",
      lastWebhookType: "message",
      lastSeenAt: new Date(),
    })),
  });

  await prisma.messageTemplate.createMany({
    data: accounts.flatMap((account) => [
      {
        accountId: account.id,
        name: "事前面談のご案内",
        content: "事前面談の日程候補を送ります。参加できる時間を教えてください。",
      },
      {
        accountId: account.id,
        name: "追加書類のお願い",
        content: "追加で必要な書類があります。確認のうえ送付をお願いします。",
      },
    ]),
  });

  if (admin) {
    await prisma.onboardingFormTemplate.create({
      data: {
        accountId: admin.id,
        name: "初回ヒアリングフォーム",
        description: "候補者の基本情報と在留カード、合格書を回収する標準テンプレート",
        questions: {
          create: [
            ...DEFAULT_FIXED_QUESTIONS.map((question, index) => ({
              fixedKey: question.fixedKey,
              label: question.label,
              type: question.type,
              required: question.required,
              sortOrder: index,
            })),
            {
              label: "希望職種",
              type: "text",
              required: false,
              sortOrder: DEFAULT_FIXED_QUESTIONS.length,
            },
            {
              label: "希望勤務地",
              type: "text",
              required: false,
              sortOrder: DEFAULT_FIXED_QUESTIONS.length + 1,
            },
          ],
        },
      },
    });
  }

  await prisma.group.createMany({
    data: [
      { name: "ベトナムパートナー" },
      { name: "介護紹介パートナー" },
    ],
  });

  const groups = await prisma.group.findMany({ orderBy: { id: "asc" } });

  await prisma.groupMember.createMany({
    data: [
      { groupId: groups[0].id, partnerId: partners[0].id },
      { groupId: groups[1].id, partnerId: partners[1].id },
    ],
  });

  await prisma.messageLog.createMany({
    data: [
      {
        title: "パートナー向け募集連絡",
        body: "海外パートナーへ案件概要を送信しました。",
        channel: "LINE",
        targetFilter: "グループ: ベトナムパートナー",
        status: "送信成功",
        matchedCount: 2,
        sentCount: 2,
        skippedCount: 0,
      },
      {
        title: "事前面談日程の確認",
        body: "候補者へ日程候補を送信しました。",
        channel: "Messenger",
        targetFilter: "グループ: 面談対象候補者",
        status: "送信成功",
        matchedCount: 1,
        sentCount: 1,
        skippedCount: 0,
      },
    ],
  });

  await prisma.company.createMany({
    data: [
      {
        name: "青海テック株式会社",
        industry: "製造",
        location: "千葉県",
        hiringStatus: "募集中",
        notes: "技能実習と特定技能の両方を検討中",
      },
      {
        name: "みらいケアサービス",
        industry: "介護",
        location: "東京都",
        hiringStatus: "面談調整中",
        notes: "4名の推薦候補を比較予定",
      },
    ],
  });

  await prisma.partner.createMany({
    data: [
      {
        name: "Hanoi Career Bridge",
        country: "ベトナム",
        channel: "LINE",
        linkStatus: "完了",
        contactName: "Tran Thi Lan",
        notes: "製造職の候補者送客が得意",
      },
      {
        name: "Jakarta Global Link",
        country: "インドネシア",
        channel: "Messenger",
        linkStatus: "未",
        contactName: "Budi Santoso",
        notes: "介護・外食の候補者に強い",
      },
    ],
  });

  const companies = await prisma.company.findMany({ orderBy: { id: "asc" } });
  const partners = await prisma.partner.findMany({ orderBy: { id: "asc" } });

  await prisma.person.update({
    where: { id: persons[0].id },
    data: { partnerId: partners[0].id },
  });
  await prisma.person.update({
    where: { id: persons[1].id },
    data: { partnerId: partners[1].id },
  });
  await prisma.person.update({
    where: { id: persons[2].id },
    data: { partnerId: partners[0].id },
  });

  await prisma.resumeTemplate.createMany({
    data: accounts.map((account, index) => ({
      accountId: account.id,
      name: index === 0 ? "標準履歴書テンプレート" : `${account.name}用履歴書テンプレート`,
      templateUrl: "https://docs.google.com/document/d/example-template/edit",
      driveFolderUrl: "https://drive.google.com/drive/folders/example-folder",
    })),
  });

  const resumeTemplates = await prisma.resumeTemplate.findMany({
    orderBy: { id: "asc" },
  });

  if (admin) {
    await prisma.resumeDocument.create({
      data: {
        personId: persons[0].id,
        templateId: resumeTemplates[0].id,
        accountId: admin.id,
        title: `${persons[0].name} 履歴書`,
        documentId: "example-resume-id",
        documentUrl: "https://docs.google.com/document/d/example-resume/edit",
        driveFolderUrl: resumeTemplates[0].driveFolderUrl,
        status: "generated",
      },
    });
  }

  await prisma.deal.createMany({
    data: [
      {
        title: "青海テック / 製造スタッフ紹介",
        companyId: companies[0].id,
        ownerId: accounts[1]?.id ?? admin?.id ?? null,
        priority: "urgent",
        status: "至急募集",
        unitPrice: "45万円 / 人",
        deadline: new Date("2026-05-15"),
        notes: "今月中に2名推薦が必要",
      },
      {
        title: "みらいケア / 介護人材紹介",
        companyId: companies[1].id,
        ownerId: accounts[2]?.id ?? admin?.id ?? null,
        priority: "normal",
        status: "面接中",
        unitPrice: "38万円 / 人",
        deadline: new Date("2026-06-01"),
        notes: "事前面談を3名分進行中",
      },
      {
        title: "青海テック / 組立ライン増員",
        companyId: companies[0].id,
        ownerId: accounts[3]?.id ?? admin?.id ?? null,
        priority: "high",
        status: "募集中",
        unitPrice: "42万円 / 人",
        deadline: new Date("2026-06-20"),
        notes: "推薦候補を広く集めたい案件",
      },
    ],
  });

  const deals = await prisma.deal.findMany({ orderBy: { id: "asc" } });

  await prisma.dealCandidate.createMany({
    data: [
      {
        dealId: deals[0].id,
        personId: persons[0].id,
        stage: "推薦済み",
        note: "在留カード確認済み",
      },
      {
        dealId: deals[0].id,
        personId: persons[2].id,
        stage: "事前面談済み",
        note: "日本語面談を実施済み",
      },
      {
        dealId: deals[1].id,
        personId: persons[1].id,
        stage: "接続済み",
        note: "候補者の書類回収中",
      },
      {
        dealId: deals[1].id,
        personId: persons[3].id,
        stage: "内定済み",
        note: "受け入れ準備へ移行",
      },
      {
        dealId: deals[2].id,
        personId: persons[5].id,
        stage: "推薦済み",
        note: "推薦済み、次回面談待ち",
      },
    ],
  });

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
