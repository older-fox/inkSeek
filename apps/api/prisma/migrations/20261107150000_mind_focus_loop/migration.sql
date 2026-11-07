-- A persona now has one attention focus at a time; chat interruptions pause a
-- phone session and resume it afterwards.

ALTER TYPE "AgentRunTrigger" ADD VALUE IF NOT EXISTS 'PHONE';

CREATE TYPE "PersonaFocusKind" AS ENUM ('CHAT', 'PHONE');
CREATE TYPE "PersonaFocusStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE');

CREATE TABLE "PersonaFocus" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "PersonaFocusKind" NOT NULL,
    "status" "PersonaFocusStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "goal" TEXT NOT NULL DEFAULT '',
    "step" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL DEFAULT '{}',
    "pausedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PersonaFocus_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaFocus_personaId_status_updatedAt_idx"
    ON "PersonaFocus"("personaId", "status", "updatedAt");
CREATE INDEX "PersonaFocus_personaId_kind_startedAt_idx"
    ON "PersonaFocus"("personaId", "kind", "startedAt");
CREATE INDEX "PersonaFocus_channelId_status_idx"
    ON "PersonaFocus"("channelId", "status");

ALTER TABLE "ChatMindSettings"
    ADD COLUMN "phonePlayChancePercent" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "phonePlayDailyLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentRun" ADD COLUMN "focusId" TEXT;
CREATE INDEX "AgentRun_focusId_startedAt_idx" ON "AgentRun"("focusId", "startedAt");
