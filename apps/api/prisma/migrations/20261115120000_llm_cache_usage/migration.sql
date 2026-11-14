-- AlterTable
ALTER TABLE "AgentRun"
  ADD COLUMN "cachedTokens" INTEGER,
  ADD COLUMN "cacheMissTokens" INTEGER,
  ADD COLUMN "reasoningTokens" INTEGER;

-- AlterTable
ALTER TABLE "LlmCallLog"
  ADD COLUMN "cachedTokens" INTEGER,
  ADD COLUMN "cacheMissTokens" INTEGER,
  ADD COLUMN "step" INTEGER;
