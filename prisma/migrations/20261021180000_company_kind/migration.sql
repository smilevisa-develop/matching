-- 企業の区分 (通常 / 人材紹介会社)
ALTER TABLE "Company" ADD COLUMN "companyKind" TEXT NOT NULL DEFAULT '通常';
-- 人材紹介会社: WILLOF / icエイジア / ADECCO
UPDATE "Company" SET "companyKind" = '人材紹介会社' WHERE "externalId" IN ('01sv', '42sv', 'ad');
