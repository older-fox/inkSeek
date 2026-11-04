-- Drop the duplicated relationship baseline. Live relation values are the only
-- copy; the channel persona owns self attributes.
ALTER TABLE "PersonaRelationship" DROP COLUMN IF EXISTS "baseValues";

-- Raw LLM request log, pruned to the newest 200 rows by the service.
CREATE TABLE "LlmPromptLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "providerId" TEXT,
    "providerName" TEXT,
    "model" TEXT,
    "system" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmPromptLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmPromptLog_createdAt_idx" ON "LlmPromptLog"("createdAt");
CREATE INDEX "LlmPromptLog_source_createdAt_idx" ON "LlmPromptLog"("source", "createdAt");
