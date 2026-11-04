-- Append-only accounting for post-turn attribute drift. Live values remain the
-- single source on the persona card / relationship / stance rows; this table
-- only tracks recent deltas so spans, daily caps and cooldowns can be enforced.
CREATE TABLE "PersonaDriftEvent" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaDriftEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaDriftEvent_personaId_scope_targetId_key_createdAt_idx"
    ON "PersonaDriftEvent"("personaId", "scope", "targetId", "key", "createdAt");
CREATE INDEX "PersonaDriftEvent_personaId_createdAt_idx"
    ON "PersonaDriftEvent"("personaId", "createdAt");

ALTER TABLE "PersonaDriftEvent"
    ADD CONSTRAINT "PersonaDriftEvent_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
