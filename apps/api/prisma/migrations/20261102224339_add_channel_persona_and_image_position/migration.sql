-- DropIndex
DROP INDEX "ChatImageAsset_messageId_idx";

-- AlterTable
ALTER TABLE "ChatImageAsset" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChatChannelPersona" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardSerial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identity" TEXT NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL DEFAULT '',
    "accent" TEXT NOT NULL DEFAULT 'brass',
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelPersona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelPersona_channelId_key" ON "ChatChannelPersona"("channelId");

-- CreateIndex
CREATE INDEX "ChatImageAsset_messageId_position_idx" ON "ChatImageAsset"("messageId", "position");

-- AddForeignKey
ALTER TABLE "ChatChannelPersona" ADD CONSTRAINT "ChatChannelPersona_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
