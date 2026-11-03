-- AlterTable
ALTER TABLE "ChatMessageRecord" ADD COLUMN     "replySnapshot" JSONB,
ADD COLUMN     "replyToExternalId" TEXT,
ADD COLUMN     "replyToMessageId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessageRecord_replyToMessageId_idx" ON "ChatMessageRecord"("replyToMessageId");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_replyToExternalId_idx" ON "ChatMessageRecord"("replyToExternalId");

-- AddForeignKey
ALTER TABLE "ChatMessageRecord" ADD CONSTRAINT "ChatMessageRecord_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
