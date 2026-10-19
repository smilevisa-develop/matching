-- stageDates の初期値を信頼できる日付だけに作り直す。
-- 前の移行は createdAt / updatedAt を使ったが、2026/10/13 に 156 件を一括で紐づけたため
-- 「10月に接続 155 / 内定 40」のように実態と違う数字になっていた。
--   接続済み … 一括取込より前 (2026/10/01 より前) に紐づけた分だけ createdAt を使う
--   内定済み / 内定承諾 … 内定者管理ボードの 内定日 / 内定承諾日 (手入力された日付) を使う
--   それ以外の段階の日付は分からないので入れない (これ以降カンバンで動かした分から記録される)
UPDATE "DealCandidate" dc
SET "stageDates" = jsonb_strip_nulls(jsonb_build_object(
  '接続済み', CASE WHEN dc."createdAt" < TIMESTAMP '2026-09-30 15:00:00'
                THEN to_char((dc."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') END,
  '内定済み', CASE WHEN dc."stage" IN ('内定済み', '内定承諾') AND pp."offerAt" IS NOT NULL
                THEN to_char((pp."offerAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') END,
  '内定承諾', CASE WHEN dc."stage" = '内定承諾' AND pp."offerAcceptedAt" IS NOT NULL
                THEN to_char((pp."offerAcceptedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') END
))
FROM (SELECT p."personId", p."offerAt", p."offerAcceptedAt" FROM "PersonPlacement" p) pp
WHERE pp."personId" = dc."personId";

UPDATE "DealCandidate" dc
SET "stageDates" = jsonb_strip_nulls(jsonb_build_object(
  '接続済み', CASE WHEN dc."createdAt" < TIMESTAMP '2026-09-30 15:00:00'
                THEN to_char((dc."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') END
))
WHERE NOT EXISTS (SELECT 1 FROM "PersonPlacement" p WHERE p."personId" = dc."personId");
