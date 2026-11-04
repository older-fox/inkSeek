-- CreateEnum
CREATE TYPE "PersonaMindMode" AS ENUM ('OFF', 'SHADOW', 'APPROVAL', 'LIVE');

-- CreateEnum
CREATE TYPE "PersonaMemoryScope" AS ENUM ('SELF', 'RELATION', 'GROUP', 'SCENE', 'WORLD', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "PersonaMemoryKind" AS ENUM ('EPISODE', 'FACT', 'PREFERENCE', 'PROMISE', 'BOUNDARY', 'REFLECTION', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "PersonaMemorySubjectType" AS ENUM ('PERSON', 'GROUP', 'SELF', 'WORLD', 'TOPIC');

-- CreateEnum
CREATE TYPE "PersonaMemoryVisibility" AS ENUM ('PRIVATE', 'SCENE', 'CHANNEL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "PersonaMemoryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DISPUTED', 'DELETED');

-- CreateEnum
CREATE TYPE "PersonaMemorySourceType" AS ENUM ('MESSAGE', 'HEARTBEAT', 'WEB', 'ADMIN', 'INFERENCE');

-- CreateEnum
CREATE TYPE "AgentTodoStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentIntentionStatus" AS ENUM ('PENDING', 'SENT', 'DEFERRED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRunTrigger" AS ENUM ('MESSAGE', 'HEARTBEAT', 'PROACTIVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('ATTENTION', 'RETRIEVAL', 'APPRAISAL', 'SOCIAL', 'TOOL', 'PLAN', 'EXPRESSION', 'WRITEBACK', 'CONSOLIDATION');

-- CreateEnum
CREATE TYPE "AgentActionKind" AS ENUM ('MESSAGE', 'STICKER', 'FACE', 'TYPING', 'MEMORY', 'TODO');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ChatMindSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mode" "PersonaMindMode" NOT NULL DEFAULT 'OFF',
    "heartbeatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyMessageBudget" INTEGER NOT NULL DEFAULT 30,
    "dailyProactiveBudget" INTEGER NOT NULL DEFAULT 3,
    "maxBeats" INTEGER NOT NULL DEFAULT 3,
    "minBeatDelayMs" INTEGER NOT NULL DEFAULT 800,
    "maxBeatDelayMs" INTEGER NOT NULL DEFAULT 4000,
    "quietHours" JSONB,
    "providerId" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMindSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaState" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "moodValence" INTEGER NOT NULL DEFAULT 0,
    "moodArousal" INTEGER NOT NULL DEFAULT 50,
    "moodDominance" INTEGER NOT NULL DEFAULT 0,
    "energy" INTEGER NOT NULL DEFAULT 70,
    "stress" INTEGER NOT NULL DEFAULT 20,
    "socialBattery" INTEGER NOT NULL DEFAULT 70,
    "attention" INTEGER NOT NULL DEFAULT 60,
    "currentActivity" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "sleepDebt" INTEGER NOT NULL DEFAULT 0,
    "lastWakeAt" TIMESTAMP(3),
    "nextWakeAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaRelationship" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "affinity" INTEGER NOT NULL DEFAULT 0,
    "trust" INTEGER NOT NULL DEFAULT 0,
    "intimacy" INTEGER NOT NULL DEFAULT 0,
    "attraction" INTEGER NOT NULL DEFAULT 0,
    "hostility" INTEGER NOT NULL DEFAULT 0,
    "fear" INTEGER NOT NULL DEFAULT 0,
    "respect" INTEGER NOT NULL DEFAULT 0,
    "obligation" INTEGER NOT NULL DEFAULT 0,
    "dependency" INTEGER NOT NULL DEFAULT 0,
    "possessiveness" INTEGER NOT NULL DEFAULT 0,
    "friction" INTEGER NOT NULL DEFAULT 0,
    "unresolvedConflict" INTEGER NOT NULL DEFAULT 0,
    "familiarity" INTEGER NOT NULL DEFAULT 0,
    "baseValues" JSONB,
    "relationTags" JSONB,
    "addressHere" JSONB,
    "publicMask" JSONB,
    "boundaries" JSONB,
    "openPromises" JSONB,
    "sharedEvents" JSONB,
    "disclosureScope" TEXT NOT NULL DEFAULT 'SCENE',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaRelationshipEvent" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "sourceMemoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaRelationshipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaGroupStance" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "comfort" INTEGER NOT NULL DEFAULT 50,
    "belonging" INTEGER NOT NULL DEFAULT 50,
    "attention" INTEGER NOT NULL DEFAULT 50,
    "formality" INTEGER NOT NULL DEFAULT 50,
    "speakRate" INTEGER NOT NULL DEFAULT 50,
    "audienceRisk" INTEGER NOT NULL DEFAULT 50,
    "role" TEXT NOT NULL DEFAULT '',
    "narrative" TEXT NOT NULL DEFAULT '',
    "boundaries" JSONB,
    "tabooTopics" JSONB,
    "sceneRules" TEXT NOT NULL DEFAULT '',
    "mentionOnly" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT NOT NULL DEFAULT '',
    "phase" TEXT NOT NULL DEFAULT '',
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaGroupStance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaMemory" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT,
    "scope" "PersonaMemoryScope" NOT NULL,
    "kind" "PersonaMemoryKind" NOT NULL,
    "subjectType" "PersonaMemorySubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL DEFAULT '',
    "subjectName" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "importance" INTEGER NOT NULL DEFAULT 50,
    "confidence" INTEGER NOT NULL DEFAULT 70,
    "emotionalValence" INTEGER NOT NULL DEFAULT 0,
    "emotionalArousal" INTEGER NOT NULL DEFAULT 0,
    "visibility" "PersonaMemoryVisibility" NOT NULL DEFAULT 'SCENE',
    "status" "PersonaMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "lastRecalledAt" TIMESTAMP(3),
    "recallCount" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "PersonaMemorySourceType" NOT NULL DEFAULT 'INFERENCE',
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "consolidatedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaMemoryLink" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaMemoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTodo" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'follow_up',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "dueAt" TIMESTAMP(3),
    "wakeCondition" JSONB,
    "recurrence" TEXT,
    "status" "AgentTodoStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'MIND',
    "relatedContactId" TEXT,
    "relatedConversationId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIntention" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'PERSON',
    "targetId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "seed" TEXT NOT NULL DEFAULT '',
    "urgency" INTEGER NOT NULL DEFAULT 50,
    "earliestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "AgentIntentionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentIntention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaSchedule" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "nextWakeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWakeAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "trigger" "AgentRunTrigger" NOT NULL DEFAULT 'MESSAGE',
    "mode" "PersonaMindMode" NOT NULL DEFAULT 'LIVE',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "providerId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "decision" JSONB,
    "socialRead" JSONB,
    "plan" JSONB,
    "scene" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "AgentStepType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "input" JSONB,
    "output" JSONB,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" "AgentActionKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "sentMessageId" TEXT,
    "error" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaJournal" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT '',
    "consolidatedMemoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMindSettings_channelId_key" ON "ChatMindSettings"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaState_personaId_key" ON "PersonaState"("personaId");

-- CreateIndex
CREATE INDEX "PersonaRelationship_channelId_contactId_idx" ON "PersonaRelationship"("channelId", "contactId");

-- CreateIndex
CREATE INDEX "PersonaRelationship_personaId_updatedAt_idx" ON "PersonaRelationship"("personaId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaRelationship_personaId_contactId_key" ON "PersonaRelationship"("personaId", "contactId");

-- CreateIndex
CREATE INDEX "PersonaRelationshipEvent_relationshipId_createdAt_idx" ON "PersonaRelationshipEvent"("relationshipId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonaGroupStance_channelId_conversationId_idx" ON "PersonaGroupStance"("channelId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaGroupStance_personaId_conversationId_key" ON "PersonaGroupStance"("personaId", "conversationId");

-- CreateIndex
CREATE INDEX "PersonaMemory_personaId_status_occurredAt_idx" ON "PersonaMemory"("personaId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "PersonaMemory_personaId_subjectType_subjectId_idx" ON "PersonaMemory"("personaId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "PersonaMemory_channelId_conversationId_occurredAt_idx" ON "PersonaMemory"("channelId", "conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "PersonaMemory_personaId_consolidatedAt_idx" ON "PersonaMemory"("personaId", "consolidatedAt");

-- CreateIndex
CREATE INDEX "PersonaMemoryLink_toId_idx" ON "PersonaMemoryLink"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaMemoryLink_fromId_toId_relation_key" ON "PersonaMemoryLink"("fromId", "toId", "relation");

-- CreateIndex
CREATE INDEX "AgentTodo_personaId_status_dueAt_idx" ON "AgentTodo"("personaId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "AgentTodo_personaId_status_createdAt_idx" ON "AgentTodo"("personaId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentIntention_personaId_status_earliestAt_idx" ON "AgentIntention"("personaId", "status", "earliestAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaSchedule_personaId_key" ON "PersonaSchedule"("personaId");

-- CreateIndex
CREATE INDEX "PersonaSchedule_nextWakeAt_idx" ON "PersonaSchedule"("nextWakeAt");

-- CreateIndex
CREATE INDEX "AgentRun_personaId_startedAt_idx" ON "AgentRun"("personaId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_conversationId_startedAt_idx" ON "AgentRun"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentStep_runId_createdAt_idx" ON "AgentStep"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_idempotencyKey_key" ON "AgentAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentAction_personaId_createdAt_idx" ON "AgentAction"("personaId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentAction_status_createdAt_idx" ON "AgentAction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StickerAsset_sha256_key" ON "StickerAsset"("sha256");

-- CreateIndex
CREATE INDEX "StickerAsset_enabled_lastUsedAt_idx" ON "StickerAsset"("enabled", "lastUsedAt");

-- CreateIndex
CREATE INDEX "PersonaJournal_personaId_createdAt_idx" ON "PersonaJournal"("personaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaJournal_personaId_date_key" ON "PersonaJournal"("personaId", "date");

-- AddForeignKey
ALTER TABLE "ChatMindSettings" ADD CONSTRAINT "ChatMindSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaState" ADD CONSTRAINT "PersonaState_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationshipEvent" ADD CONSTRAINT "PersonaRelationshipEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "PersonaRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaGroupStance" ADD CONSTRAINT "PersonaGroupStance_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaGroupStance" ADD CONSTRAINT "PersonaGroupStance_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaGroupStance" ADD CONSTRAINT "PersonaGroupStance_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaMemory" ADD CONSTRAINT "PersonaMemory_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaMemory" ADD CONSTRAINT "PersonaMemory_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTodo" ADD CONSTRAINT "AgentTodo_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTodo" ADD CONSTRAINT "AgentTodo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIntention" ADD CONSTRAINT "AgentIntention_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIntention" ADD CONSTRAINT "AgentIntention_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaSchedule" ADD CONSTRAINT "PersonaSchedule_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaJournal" ADD CONSTRAINT "PersonaJournal_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaJournal" ADD CONSTRAINT "PersonaJournal_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

