-- CreateEnum
CREATE TYPE "ChatPipelineScope" AS ENUM ('GLOBAL', 'CHANNEL', 'PERSONA');

-- CreateEnum
CREATE TYPE "ChatPipelineRunMode" AS ENUM ('LIVE', 'DEBUG');

-- AlterTable
ALTER TABLE "ChatPipelineGraph" ADD COLUMN "scope" "ChatPipelineScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "scopeId" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "ChatPipelineGraph_scope_scopeId_key" ON "ChatPipelineGraph"("scope", "scopeId");

-- AlterTable
ALTER TABLE "ChatPipelineRun" ALTER COLUMN "channelId" DROP NOT NULL,
ALTER COLUMN "conversationId" DROP NOT NULL,
ADD COLUMN "scope" "ChatPipelineScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "scopeId" TEXT,
ADD COLUMN "mode" "ChatPipelineRunMode" NOT NULL DEFAULT 'LIVE',
ADD COLUMN "personaCardId" TEXT,
ADD COLUMN "effects" JSONB,
ADD COLUMN "debugInput" JSONB;

-- Existing runs were all live channel runs.
UPDATE "ChatPipelineRun"
SET "scope" = 'CHANNEL', "scopeId" = "channelId"
WHERE "channelId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ChatPipelineRun_personaCardId_idx" ON "ChatPipelineRun"("personaCardId");

-- CreateIndex
CREATE INDEX "ChatPipelineRun_scope_scopeId_startedAt_idx" ON "ChatPipelineRun"("scope", "scopeId", "startedAt");

-- AddForeignKey
ALTER TABLE "ChatPipelineRun" ADD CONSTRAINT "ChatPipelineRun_personaCardId_fkey" FOREIGN KEY ("personaCardId") REFERENCES "PersonaCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
