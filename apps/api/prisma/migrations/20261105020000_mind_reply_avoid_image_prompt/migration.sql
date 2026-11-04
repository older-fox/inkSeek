-- Per-channel mind behavior knobs:
-- replyAvoidMinutes gates duplicate replies after the model commits to answer.
-- imageDescriptionPrompt overrides the built-in vision prompt; empty = default.
ALTER TABLE "ChatMindSettings"
    ADD COLUMN "replyAvoidMinutes" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "imageDescriptionPrompt" TEXT NOT NULL DEFAULT '';
