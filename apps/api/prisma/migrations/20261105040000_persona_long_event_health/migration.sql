-- Body health is a first-class state value so interrupted sleep can damage it.
ALTER TABLE "PersonaState"
    ADD COLUMN "health" INTEGER NOT NULL DEFAULT 80;

-- Long-running agent-authored events (sleep, focus, away).
CREATE TABLE "PersonaLongEvent" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SLEEP',
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedEndAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "wakeMentions" INTEGER NOT NULL DEFAULT 3,
    "wakeWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "wakeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "lastStimulusAt" TIMESTAMP(3),
    "wakeReason" TEXT,
    "effects" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaLongEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaLongEvent_personaId_status_startedAt_idx"
    ON "PersonaLongEvent"("personaId", "status", "startedAt");

ALTER TABLE "PersonaLongEvent"
    ADD CONSTRAINT "PersonaLongEvent_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
