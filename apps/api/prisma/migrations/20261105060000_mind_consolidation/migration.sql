-- Consolidate the mind audit tables into PersonaChangeLog, fold the heartbeat
-- lease into PersonaState, and drop the retired message-pipeline tables.
-- Data backup: data/backup/persona-mind-2026-11-05.json

-- 1. One append-only audit for state, self traits, relationships and stances.
CREATE TABLE "PersonaChangeLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'STATE',
    "targetId" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "delta" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaChangeLog_pkey" PRIMARY KEY ("id")
);

-- 2. Copy state changes.
INSERT INTO "PersonaChangeLog" (
    "id", "personaId", "scope", "targetId", "field",
    "beforeValue", "afterValue", "delta", "reason", "source", "runId", "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || c."id"),
    c."personaId",
    'STATE',
    '',
    c."field",
    c."beforeValue",
    c."afterValue",
    c."delta",
    c."reason",
    c."source",
    c."runId",
    c."createdAt"
FROM "PersonaStateChange" c;

-- 3. Copy relationship deltas, one row per changed dimension.
INSERT INTO "PersonaChangeLog" (
    "id", "personaId", "scope", "targetId", "field",
    "beforeValue", "afterValue", "delta", "reason", "source", "runId", "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || e."key" || r."id"),
    r."personaId",
    'RELATION',
    r."contactId",
    e."key",
    NULL,
    NULL,
    NULLIF(e."value", 'null')::integer,
    ev."reason",
    ev."kind",
    NULL,
    ev."createdAt"
FROM "PersonaRelationshipEvent" ev
JOIN "PersonaRelationship" r ON r."id" = ev."relationshipId"
CROSS JOIN LATERAL jsonb_each_text(ev."delta") AS e("key", "value")
WHERE jsonb_typeof(ev."delta") = 'object'
  AND e."value" ~ '^-?[0-9]+$';

-- 4. Copy the drift quota ledger.
INSERT INTO "PersonaChangeLog" (
    "id", "personaId", "scope", "targetId", "field",
    "beforeValue", "afterValue", "delta", "reason", "source", "runId", "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || d."id"),
    d."personaId",
    CASE d."scope" WHEN 'ACTIVITY' THEN 'STATE' ELSE d."scope" END,
    d."targetId",
    d."key",
    NULL,
    NULL,
    d."delta",
    d."reason",
    'DRIFT',
    NULL,
    d."createdAt"
FROM "PersonaDriftEvent" d;

CREATE INDEX "PersonaChangeLog_personaId_createdAt_idx"
    ON "PersonaChangeLog"("personaId", "createdAt");
CREATE INDEX "PersonaChangeLog_personaId_scope_targetId_field_createdAt_idx"
    ON "PersonaChangeLog"("personaId", "scope", "targetId", "field", "createdAt");
ALTER TABLE "PersonaChangeLog"
    ADD CONSTRAINT "PersonaChangeLog_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Fold the heartbeat lease into PersonaState.
ALTER TABLE "PersonaState"
    ADD COLUMN "leaseOwner" TEXT,
    ADD COLUMN "leaseUntil" TIMESTAMP(3),
    ADD COLUMN "wakeReason" TEXT NOT NULL DEFAULT '';

UPDATE "PersonaState" s
SET
    "nextWakeAt" = COALESCE(p."nextWakeAt", s."nextWakeAt"),
    "leaseUntil" = p."leaseUntil",
    "leaseOwner" = p."leaseOwner",
    "wakeReason" = COALESCE(NULLIF(p."reason", ''), s."wakeReason")
FROM "PersonaSchedule" p
WHERE p."personaId" = s."personaId";

CREATE INDEX "PersonaState_nextWakeAt_idx" ON "PersonaState"("nextWakeAt");

-- 6. Drop the old audit/schedule tables.
ALTER TABLE "PersonaStateChange" DROP CONSTRAINT IF EXISTS "PersonaStateChange_personaId_fkey";
ALTER TABLE "PersonaRelationshipEvent" DROP CONSTRAINT IF EXISTS "PersonaRelationshipEvent_relationshipId_fkey";
ALTER TABLE "PersonaDriftEvent" DROP CONSTRAINT IF EXISTS "PersonaDriftEvent_personaId_fkey";
ALTER TABLE "PersonaSchedule" DROP CONSTRAINT IF EXISTS "PersonaSchedule_personaId_fkey";
DROP TABLE "PersonaStateChange";
DROP TABLE "PersonaRelationshipEvent";
DROP TABLE "PersonaDriftEvent";
DROP TABLE "PersonaSchedule";
DROP TABLE "PersonaMemoryLink";

-- 7. Drop the message pipeline.
ALTER TABLE "ChatPipelineNodeRun" DROP CONSTRAINT IF EXISTS "ChatPipelineNodeRun_runId_fkey";
ALTER TABLE "ChatPipelineRun" DROP CONSTRAINT IF EXISTS "ChatPipelineRun_channelId_fkey";
ALTER TABLE "ChatPipelineRun" DROP CONSTRAINT IF EXISTS "ChatPipelineRun_conversationId_fkey";
ALTER TABLE "ChatPipelineRun" DROP CONSTRAINT IF EXISTS "ChatPipelineRun_messageId_fkey";
ALTER TABLE "ChatPipelineRun" DROP CONSTRAINT IF EXISTS "ChatPipelineRun_personaCardId_fkey";
DROP TABLE "ChatPipelineNodeRun";
DROP TABLE "ChatPipelineRun";
DROP TABLE "ChatPipelineGraph";
DROP TYPE "ChatPipelineNodeStatus";
DROP TYPE "ChatPipelineRunMode";
DROP TYPE "ChatPipelineRunStatus";
DROP TYPE "ChatPipelineScope";
