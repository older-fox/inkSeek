-- AlterTable
ALTER TABLE "LlmCallLog"
  ADD COLUMN "finishReason" TEXT,
  ADD COLUMN "reasoningTokens" INTEGER;
