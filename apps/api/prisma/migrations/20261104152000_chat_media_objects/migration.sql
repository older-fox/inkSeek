-- CreateTable
CREATE TABLE "ChatMediaObject" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMediaObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMediaObject_sha256_key" ON "ChatMediaObject"("sha256");

-- AlterTable
ALTER TABLE "ChatImageAsset" ADD COLUMN "mediaId" TEXT;

-- AlterTable
ALTER TABLE "ChatForwardNodeImage" ADD COLUMN "mediaId" TEXT;

-- CreateIndex
CREATE INDEX "ChatImageAsset_mediaId_idx" ON "ChatImageAsset"("mediaId");

-- CreateIndex
CREATE INDEX "ChatForwardNodeImage_mediaId_idx" ON "ChatForwardNodeImage"("mediaId");

-- AddForeignKey
ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "ChatMediaObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNodeImage" ADD CONSTRAINT "ChatForwardNodeImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "ChatMediaObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
