-- Low-probability everyday events: the chance is rolled only on idle
-- heartbeats and the daily cap keeps ordinary days quiet.
ALTER TABLE "ChatMindSettings"
    ADD COLUMN "lifeEventChancePercent" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "lifeEventDailyLimit" INTEGER NOT NULL DEFAULT 1;
