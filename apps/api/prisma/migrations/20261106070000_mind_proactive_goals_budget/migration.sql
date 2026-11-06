-- Goal hypotheses for proactive speech + wake budget settings.
ALTER TABLE "ChatMindSettings"
  ADD COLUMN "proactiveWakeDailyLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "proactiveWakeMinGapSeconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentIntention"
  ADD COLUMN "need" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "confidence" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "risk" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "feedback" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "feedbackAt" TIMESTAMP(3);
