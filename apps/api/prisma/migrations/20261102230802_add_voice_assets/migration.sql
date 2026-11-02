/*
  Warnings:

  - You are about to drop the column `signature` on the `ChatChannel` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ChatMessageKind" ADD VALUE 'VOICE';

-- AlterTable
ALTER TABLE "ChatChannel" DROP COLUMN "signature";

-- CreateTable
CREATE TABLE "ChatVoiceAsset" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "duration" INTEGER,
    "remoteUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatVoiceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatVoiceAsset_messageId_position_idx" ON "ChatVoiceAsset"("messageId", "position");

-- AddForeignKey
ALTER TABLE "ChatVoiceAsset" ADD CONSTRAINT "ChatVoiceAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
