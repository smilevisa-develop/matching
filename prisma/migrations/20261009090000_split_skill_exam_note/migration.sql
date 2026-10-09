-- 在留資格別メモ (技能検定 / 評価試験など) を実習経験から切り離す。
-- これまで候補者詳細の「在留資格別」欄は traineeExperience に保存していたため、
-- AI 取込が入れた実習経験の内容と混ざり、推薦リストの「実習経験有無」に
-- 技能検定の記述が出てしまっていた。
ALTER TABLE "ResumeProfile" ADD COLUMN "skillExamNote" TEXT;
