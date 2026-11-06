-- Video understanding cache: one row per platform video id, independent of the
-- conversation or channel that first watched it.
CREATE TABLE "VideoInsight" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'bilibili',
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "coverUrl" TEXT,
    "stats" JSONB,
    "transcript" TEXT NOT NULL DEFAULT '',
    "comments" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "keyPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "framesPath" TEXT,
    "frameCount" INTEGER NOT NULL DEFAULT 0,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoInsight_platform_videoId_key"
    ON "VideoInsight"("platform", "videoId");

CREATE INDEX "VideoInsight_lastUsedAt_idx"
    ON "VideoInsight"("lastUsedAt");
