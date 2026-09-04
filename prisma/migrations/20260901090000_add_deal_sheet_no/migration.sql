-- 企業データベース(スプシ)「案件情報」の 案件ID を案件に記録する。
-- 系とスプシで番号がずれた案件があるため、一度対応づいた番号を固定して
-- 以後ずれない / 二重に追記されないようにする。
ALTER TABLE "Deal" ADD COLUMN "sheetDealNo" TEXT;
CREATE UNIQUE INDEX "Deal_sheetDealNo_key" ON "Deal"("sheetDealNo");
