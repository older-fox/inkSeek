-- Link each LLM prompt log to the mind run that produced it.
ALTER TABLE "LlmPromptLog" ADD COLUMN "runId" TEXT;

CREATE INDEX "LlmPromptLog_runId_createdAt_idx" ON "LlmPromptLog"("runId", "createdAt");
