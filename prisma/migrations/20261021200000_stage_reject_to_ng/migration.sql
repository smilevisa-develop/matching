-- 候補者ステータス「不合格」を廃止し「選考NG」にまとめる (日付の記録も付け替える)。「内定取り消し」はコードで追加
UPDATE "DealCandidate"
SET "stageDates" = ("stageDates" - '不合格') || jsonb_build_object('選考NG', "stageDates"->'不合格')
WHERE "stageDates" ? '不合格' AND NOT ("stageDates" ? '選考NG');
UPDATE "DealCandidate" SET "stageDates" = "stageDates" - '不合格' WHERE "stageDates" ? '不合格';
UPDATE "DealCandidate" SET "stage" = '選考NG' WHERE "stage" = '不合格';
