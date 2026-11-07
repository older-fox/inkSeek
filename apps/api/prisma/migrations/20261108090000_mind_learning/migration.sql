-- Autonomous learning: settings, session logs, and learned expression notes.

ALTER TABLE "ChatMindSettings"
    ADD COLUMN "learningEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "learningIntervalHours" INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN "learningDailySourceLimit" INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN "browserEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "styleLearningEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "stylePromotionEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MindHeartbeatLog"
    ADD COLUMN "learning" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MindLearningLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'HEARTBEAT',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "reason" TEXT NOT NULL DEFAULT '',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "learned" JSONB NOT NULL DEFAULT '[]',
    "styleNotes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "runId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "MindLearningLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MindLearningLog_personaId_startedAt_idx"
    ON "MindLearningLog"("personaId", "startedAt");
CREATE INDEX "MindLearningLog_channelId_startedAt_idx"
    ON "MindLearningLog"("channelId", "startedAt");

CREATE TABLE "PersonaStyleNote" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SELF',
    "contactId" TEXT NOT NULL DEFAULT '',
    "dimension" TEXT NOT NULL DEFAULT 'tone',
    "content" TEXT NOT NULL,
    "samples" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "lastAppliedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonaStyleNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaStyleNote_personaId_status_idx"
    ON "PersonaStyleNote"("personaId", "status");
CREATE INDEX "PersonaStyleNote_channelId_contactId_status_idx"
    ON "PersonaStyleNote"("channelId", "contactId", "status");
