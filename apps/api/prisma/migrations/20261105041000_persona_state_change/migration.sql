-- Audit trail for the self-state values shown in "此刻的 TA".
CREATE TABLE "PersonaStateChange" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "delta" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaStateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonaStateChange_personaId_createdAt_idx"
    ON "PersonaStateChange"("personaId", "createdAt");

ALTER TABLE "PersonaStateChange"
    ADD CONSTRAINT "PersonaStateChange_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
