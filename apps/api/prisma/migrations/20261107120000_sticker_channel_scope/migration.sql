-- The sticker library used to be one global pool. Key every sticker to the
-- channel that collected it and make the content hash unique per channel.
ALTER TABLE "StickerAsset"
    ADD COLUMN "channelId" TEXT;

UPDATE "StickerAsset"
SET "channelId" = (SELECT "id" FROM "ChatChannel" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "channelId" IS NULL;

ALTER TABLE "StickerAsset"
    ALTER COLUMN "channelId" SET NOT NULL;

DROP INDEX "StickerAsset_sha256_key";
DROP INDEX "StickerAsset_enabled_lastUsedAt_idx";

CREATE UNIQUE INDEX "StickerAsset_channelId_sha256_key"
    ON "StickerAsset"("channelId", "sha256");

CREATE INDEX "StickerAsset_channelId_enabled_lastUsedAt_idx"
    ON "StickerAsset"("channelId", "enabled", "lastUsedAt");

ALTER TABLE "StickerAsset" DROP COLUMN "scope";

ALTER TABLE "StickerAsset"
    ADD CONSTRAINT "StickerAsset_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
