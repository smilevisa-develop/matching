-- 内定者管理: 「入社・請求」を「入社」と「請求」に分ける。請求のタスクは新しい工程「11. 請求」へ
UPDATE "PlacementTask" SET "category" = '11. 請求' WHERE "category" = '10. 入社前後' AND "title" = '請求対応を実施する';
