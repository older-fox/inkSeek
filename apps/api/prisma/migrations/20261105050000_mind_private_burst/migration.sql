-- Private-chat burst merging: 0 disables, otherwise wait this many quiet
-- seconds before one reply for the whole burst.
ALTER TABLE "ChatMindSettings"
    ADD COLUMN "privateBurstSeconds" INTEGER NOT NULL DEFAULT 0;
