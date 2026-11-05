-- Curiosity exploration on idle heartbeats and periodic self-reflection.
ALTER TABLE "ChatMindSettings"
    ADD COLUMN "curiosityChancePercent" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "curiosityDailyLimit" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "reflectionIntervalHours" INTEGER NOT NULL DEFAULT 6;
