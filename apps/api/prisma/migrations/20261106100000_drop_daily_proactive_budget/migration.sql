-- Proactive messages are no longer capped by a daily count.
ALTER TABLE "ChatMindSettings" DROP COLUMN IF EXISTS "dailyProactiveBudget";
