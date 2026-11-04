-- The reply avoidance window is measured in seconds. Existing rows stored
-- minutes, so multiply them to preserve the configured window.
ALTER TABLE "ChatMindSettings"
    RENAME COLUMN "replyAvoidMinutes" TO "replyAvoidSeconds";

UPDATE "ChatMindSettings"
SET "replyAvoidSeconds" = "replyAvoidSeconds" * 60;

ALTER TABLE "ChatMindSettings"
    ALTER COLUMN "replyAvoidSeconds" SET DEFAULT 180;
