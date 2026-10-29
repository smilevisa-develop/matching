-- 企業の担当者 (先方の窓口) と連絡手段。[{ name, method, value }] (複数人)
ALTER TABLE "Company" ADD COLUMN "contacts" JSONB;
