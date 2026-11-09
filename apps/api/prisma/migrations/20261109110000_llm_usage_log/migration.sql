-- Token usage for attributed LLM calls outside an AgentRun. Vision calls
-- (image descriptions, video frames, screenshots) land here so the insights
-- page can include them without double counting run-scoped usage.
CREATE TABLE "LlmUsageLog" (
  "id" TEXT NOT NULL,
  "channelId" TEXT,
  "personaId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'llm',
  "model" TEXT,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "imageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmUsageLog_channelId_createdAt_idx" ON "LlmUsageLog"("channelId", "createdAt");
CREATE INDEX "LlmUsageLog_personaId_createdAt_idx" ON "LlmUsageLog"("personaId", "createdAt");
CREATE INDEX "LlmUsageLog_source_createdAt_idx" ON "LlmUsageLog"("source", "createdAt");
