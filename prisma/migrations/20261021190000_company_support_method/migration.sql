-- 企業の支援方法 (スプシ「企業マスタ」E列)
ALTER TABLE "Company" ADD COLUMN "supportMethod" TEXT;
-- スプシに入っていた値を取り込む (2026/10/21 時点の企業マスタ)
UPDATE "Company" SET "supportMethod" = '他支援' WHERE "externalId" IN ('01ag', '42ag', '78ag');
UPDATE "Company" SET "supportMethod" = 'SMILEVISA' WHERE "externalId" IN ('03sv', '47sv');
UPDATE "Company" SET "supportMethod" = '自社支援' WHERE "externalId" IN ('24sv', '52sv');
UPDATE "Company" SET "supportMethod" = '委託支援' WHERE "externalId" = '64sv';
