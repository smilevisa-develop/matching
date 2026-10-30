-- チャット画面の翻訳: 担当者ごとの表示言語と、メッセージの訳文
ALTER TABLE "StaffAccount" ADD COLUMN "chatLanguage" TEXT NOT NULL DEFAULT 'ja';

ALTER TABLE "Message" ADD COLUMN "sourceLang" TEXT;

CREATE TABLE "MessageTranslation" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTranslation_messageId_lang_key" ON "MessageTranslation"("messageId", "lang");

ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
