-- Persona mind: remember where the last exchange was intentionally closed so
-- the next wake can say "this was already wrapped up" instead of reopening it.
ALTER TABLE "ChatConversation"
  ADD COLUMN "closureClosedAt" TIMESTAMP(3),
  ADD COLUMN "closureReason" TEXT,
  ADD COLUMN "closureSummary" TEXT,
  ADD COLUMN "closureNextOpening" TEXT,
  ADD COLUMN "closureReopenedAt" TIMESTAMP(3);
