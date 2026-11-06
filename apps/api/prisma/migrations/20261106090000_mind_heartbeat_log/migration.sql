CREATE TABLE "MindHeartbeatLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "quiet" BOOLEAN NOT NULL DEFAULT false,
    "dueTodos" INTEGER NOT NULL DEFAULT 0,
    "dueIntentions" INTEGER NOT NULL DEFAULT 0,
    "unconsolidated" INTEGER NOT NULL DEFAULT 0,
    "lifeEvent" BOOLEAN NOT NULL DEFAULT false,
    "curiosity" BOOLEAN NOT NULL DEFAULT false,
    "reflection" BOOLEAN NOT NULL DEFAULT false,
    "runId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MindHeartbeatLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MindHeartbeatLog_personaId_createdAt_idx" ON "MindHeartbeatLog"("personaId", "createdAt");
CREATE INDEX "MindHeartbeatLog_channelId_createdAt_idx" ON "MindHeartbeatLog"("channelId", "createdAt");
CREATE INDEX "MindHeartbeatLog_runId_idx" ON "MindHeartbeatLog"("runId");
