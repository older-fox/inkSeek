-- 基线迁移：2026-11-13 把 51 条历史迁移压缩成一条（线上库当时无业务数据）。
-- 生成方式：pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- 后续结构变更请新增迁移文件，不要修改本文件，否则各环境校验和会分叉。

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProviderProtocol" AS ENUM ('openai', 'anthropic', 'gemini');

-- CreateEnum
CREATE TYPE "ChatChannelStatus" AS ENUM ('CONNECTING', 'ONLINE', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "ChatConversationKind" AS ENUM ('PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VOICE', 'FACE', 'MIXED', 'SYSTEM', 'FORWARD');

-- CreateEnum
CREATE TYPE "ChatForwardSource" AS ENUM ('INLINE', 'FETCHED');

-- CreateEnum
CREATE TYPE "ChatForwardStatus" AS ENUM ('COMPLETE', 'TRUNCATED', 'FAILED');

-- CreateEnum
CREATE TYPE "PersonaMindMode" AS ENUM ('OFF', 'SHADOW', 'APPROVAL', 'LIVE');

-- CreateEnum
CREATE TYPE "MindSceneDetail" AS ENUM ('OFF', 'ACTION', 'EXPLICIT');

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
CREATE TYPE "AgentRunTrigger" AS ENUM ('MESSAGE', 'HEARTBEAT', 'PROACTIVE', 'MANUAL', 'PHONE');

-- CreateEnum
CREATE TYPE "PersonaFocusKind" AS ENUM ('CHAT', 'PHONE');

-- CreateEnum
CREATE TYPE "PersonaFocusStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('ATTENTION', 'RETRIEVAL', 'APPRAISAL', 'SOCIAL', 'TOOL', 'PLAN', 'EXPRESSION', 'WRITEBACK', 'CONSOLIDATION');

-- CreateEnum
CREATE TYPE "AgentActionKind" AS ENUM ('MESSAGE', 'STICKER', 'FACE', 'TYPING', 'MEMORY', 'TODO');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ModelProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" "ProviderProtocol" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "models" JSONB NOT NULL,
    "modelCount" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaCard" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occupation" TEXT NOT NULL DEFAULT '',
    "age" INTEGER NOT NULL DEFAULT 0,
    "profile" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaVersion" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'qq',
    "connector" TEXT NOT NULL DEFAULT 'NapCat',
    "displayName" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "serverUrl" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "ChatChannelStatus" NOT NULL DEFAULT 'CONNECTING',
    "lastError" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannelPersona" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardSerial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identity" TEXT NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL DEFAULT '',
    "accent" TEXT NOT NULL DEFAULT 'brass',
    "values" JSONB NOT NULL,
    "history" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatContact" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "ChatConversationKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "memberCount" INTEGER,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "directContactId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageSender" TEXT,
    "closureClosedAt" TIMESTAMP(3),
    "closureReason" TEXT,
    "closureSummary" TEXT,
    "closureNextOpening" TEXT,
    "closureReopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatGroupMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "card" TEXT,
    "role" TEXT,
    "joinedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageRecord" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderCard" TEXT,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL DEFAULT '',
    "segments" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "replyToExternalId" TEXT,
    "replyToMessageId" TEXT,
    "replySnapshot" JSONB,

    CONSTRAINT "ChatMessageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMediaObject" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMediaObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatImageAsset" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "forwardNodeId" TEXT,
    "mediaId" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "remoteUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatVoiceAsset" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "forwardNodeId" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "duration" INTEGER,
    "description" TEXT,
    "remoteUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatVoiceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatForward" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "forwardId" TEXT,
    "title" TEXT NOT NULL,
    "source" "ChatForwardSource" NOT NULL,
    "status" "ChatForwardStatus" NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatForwardNode" (
    "id" TEXT NOT NULL,
    "forwardId" TEXT NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "senderExternalId" TEXT,
    "senderName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "kind" "ChatMessageKind" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "segments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatForwardNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMindSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mode" "PersonaMindMode" NOT NULL DEFAULT 'OFF',
    "heartbeatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "selfScheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wakeIntervalMinutes" INTEGER NOT NULL DEFAULT 45,
    "wakeMinMinutes" INTEGER NOT NULL DEFAULT 10,
    "wakeMaxMinutes" INTEGER NOT NULL DEFAULT 240,
    "quietIntervalMinutes" INTEGER NOT NULL DEFAULT 90,
    "dailyMessageBudget" INTEGER NOT NULL DEFAULT 30,
    "proactiveWakeDailyLimit" INTEGER NOT NULL DEFAULT 0,
    "proactiveWakeMinGapSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxBeats" INTEGER NOT NULL DEFAULT 3,
    "sceneDetail" "MindSceneDetail" NOT NULL DEFAULT 'OFF',
    "minBeatDelayMs" INTEGER NOT NULL DEFAULT 800,
    "maxBeatDelayMs" INTEGER NOT NULL DEFAULT 4000,
    "replyAvoidSeconds" INTEGER NOT NULL DEFAULT 180,
    "privateBurstSeconds" INTEGER NOT NULL DEFAULT 0,
    "lifeEventChancePercent" INTEGER NOT NULL DEFAULT 1,
    "lifeEventDailyLimit" INTEGER NOT NULL DEFAULT 1,
    "curiosityChancePercent" INTEGER NOT NULL DEFAULT 15,
    "curiosityDailyLimit" INTEGER NOT NULL DEFAULT 0,
    "reflectionIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "imageDescriptionPrompt" TEXT NOT NULL DEFAULT '',
    "quietHours" JSONB,
    "providerId" TEXT,
    "model" TEXT,
    "phoneDevice" TEXT,
    "phonePlayChancePercent" INTEGER NOT NULL DEFAULT 0,
    "phonePlayDailyLimit" INTEGER NOT NULL DEFAULT 0,
    "learningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "learningIntervalHours" INTEGER NOT NULL DEFAULT 12,
    "learningDailySourceLimit" INTEGER NOT NULL DEFAULT 6,
    "browserEnabled" BOOLEAN NOT NULL DEFAULT true,
    "styleLearningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "stylePromotionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMindSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaFocus" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "PersonaFocusKind" NOT NULL,
    "status" "PersonaFocusStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "goal" TEXT NOT NULL DEFAULT '',
    "step" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL DEFAULT '{}',
    "pausedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PersonaFocus_pkey" PRIMARY KEY ("id")
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
    "activitySince" TIMESTAMP(3),
    "activityCheckedAt" TIMESTAMP(3),
    "location" TEXT NOT NULL DEFAULT '',
    "sleepDebt" INTEGER NOT NULL DEFAULT 0,
    "health" INTEGER NOT NULL DEFAULT 80,
    "grooming" INTEGER NOT NULL DEFAULT 70,
    "lastWakeAt" TIMESTAMP(3),
    "nextWakeAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "wakeReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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
    "relationTags" JSONB,
    "addressHere" JSONB,
    "publicMask" JSONB,
    "boundaries" JSONB,
    "openPromises" JSONB,
    "sharedEvents" JSONB,
    "extras" JSONB,
    "disclosureScope" TEXT NOT NULL DEFAULT 'SCENE',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaGroupStance" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "comfort" INTEGER NOT NULL DEFAULT 0,
    "belonging" INTEGER NOT NULL DEFAULT 0,
    "attention" INTEGER NOT NULL DEFAULT 0,
    "formality" INTEGER NOT NULL DEFAULT 0,
    "speakRate" INTEGER NOT NULL DEFAULT 0,
    "audienceRisk" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT '',
    "narrative" TEXT NOT NULL DEFAULT '',
    "boundaries" JSONB,
    "tabooTopics" JSONB,
    "sceneRules" TEXT NOT NULL DEFAULT '',
    "mentionOnly" BOOLEAN NOT NULL DEFAULT false,
    "topic" TEXT NOT NULL DEFAULT '',
    "phase" TEXT NOT NULL DEFAULT '',
    "extras" JSONB,
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
    "staleReviewedAt" TIMESTAMP(3),
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
    "need" TEXT NOT NULL DEFAULT '',
    "urgency" INTEGER NOT NULL DEFAULT 50,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "risk" INTEGER NOT NULL DEFAULT 20,
    "feedback" TEXT NOT NULL DEFAULT '',
    "feedbackAt" TIMESTAMP(3),
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
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "focusId" TEXT,
    "trigger" "AgentRunTrigger" NOT NULL DEFAULT 'MESSAGE',
    "mode" "PersonaMindMode" NOT NULL DEFAULT 'LIVE',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "providerId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
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
CREATE TABLE "MindHeartbeatLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "quiet" BOOLEAN NOT NULL DEFAULT false,
    "dueTodos" INTEGER NOT NULL DEFAULT 0,
    "dueIntentions" INTEGER NOT NULL DEFAULT 0,
    "unconsolidated" INTEGER NOT NULL DEFAULT 0,
    "lifeEvent" BOOLEAN NOT NULL DEFAULT false,
    "curiosity" BOOLEAN NOT NULL DEFAULT false,
    "reflection" BOOLEAN NOT NULL DEFAULT false,
    "learning" BOOLEAN NOT NULL DEFAULT false,
    "runId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MindHeartbeatLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MindLearningLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'HEARTBEAT',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "reason" TEXT NOT NULL DEFAULT '',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "learned" JSONB NOT NULL DEFAULT '[]',
    "styleNotes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "runId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MindLearningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaStyleNote" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SELF',
    "contactId" TEXT NOT NULL DEFAULT '',
    "dimension" TEXT NOT NULL DEFAULT 'tone',
    "content" TEXT NOT NULL,
    "samples" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "lastAppliedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaStyleNote_pkey" PRIMARY KEY ("id")
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
    "channelId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoInsight" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'bilibili',
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverUrl" TEXT,
    "stats" JSONB,
    "transcript" TEXT NOT NULL DEFAULT '',
    "comments" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "framesPath" TEXT,
    "frameCount" INTEGER NOT NULL DEFAULT 0,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCallLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "channelId" TEXT,
    "personaId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "providerId" TEXT,
    "providerName" TEXT,
    "model" TEXT,
    "system" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT,
    "response" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCallLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelProvider_name_key" ON "ModelProvider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaCard_serial_key" ON "PersonaCard"("serial");

-- CreateIndex
CREATE INDEX "PersonaCard_name_idx" ON "PersonaCard"("name");

-- CreateIndex
CREATE INDEX "PersonaCard_updatedAt_idx" ON "PersonaCard"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaVersion_personaId_version_key" ON "PersonaVersion"("personaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_platform_accountId_key" ON "ChatChannel"("platform", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelPersona_channelId_key" ON "ChatChannelPersona"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatContact_channelId_externalId_key" ON "ChatContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "ChatConversation_channelId_kind_lastMessageAt_idx" ON "ChatConversation"("channelId", "kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_channelId_isDirect_idx" ON "ChatConversation"("channelId", "isDirect");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_channelId_kind_externalId_key" ON "ChatConversation"("channelId", "kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatGroupMember_conversationId_contactId_key" ON "ChatGroupMember"("conversationId", "contactId");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_conversationId_sentAt_idx" ON "ChatMessageRecord"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_channelId_sentAt_idx" ON "ChatMessageRecord"("channelId", "sentAt");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_replyToMessageId_idx" ON "ChatMessageRecord"("replyToMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageRecord_conversationId_externalId_key" ON "ChatMessageRecord"("conversationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMediaObject_sha256_key" ON "ChatMediaObject"("sha256");

-- CreateIndex
CREATE INDEX "ChatImageAsset_messageId_position_idx" ON "ChatImageAsset"("messageId", "position");

-- CreateIndex
CREATE INDEX "ChatImageAsset_forwardNodeId_position_idx" ON "ChatImageAsset"("forwardNodeId", "position");

-- CreateIndex
CREATE INDEX "ChatImageAsset_mediaId_idx" ON "ChatImageAsset"("mediaId");

-- CreateIndex
CREATE INDEX "ChatVoiceAsset_messageId_position_idx" ON "ChatVoiceAsset"("messageId", "position");

-- CreateIndex
CREATE INDEX "ChatVoiceAsset_forwardNodeId_position_idx" ON "ChatVoiceAsset"("forwardNodeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ChatForward_messageId_key" ON "ChatForward"("messageId");

-- CreateIndex
CREATE INDEX "ChatForward_forwardId_idx" ON "ChatForward"("forwardId");

-- CreateIndex
CREATE INDEX "ChatForwardNode_forwardId_parentId_position_idx" ON "ChatForwardNode"("forwardId", "parentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMindSettings_channelId_key" ON "ChatMindSettings"("channelId");

-- CreateIndex
CREATE INDEX "PersonaFocus_personaId_status_updatedAt_idx" ON "PersonaFocus"("personaId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PersonaFocus_personaId_kind_startedAt_idx" ON "PersonaFocus"("personaId", "kind", "startedAt");

-- CreateIndex
CREATE INDEX "PersonaFocus_channelId_status_idx" ON "PersonaFocus"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaState_personaId_key" ON "PersonaState"("personaId");

-- CreateIndex
CREATE INDEX "PersonaState_nextWakeAt_idx" ON "PersonaState"("nextWakeAt");

-- CreateIndex
CREATE INDEX "PersonaLongEvent_personaId_status_startedAt_idx" ON "PersonaLongEvent"("personaId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "PersonaChangeLog_personaId_createdAt_idx" ON "PersonaChangeLog"("personaId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonaChangeLog_personaId_scope_targetId_field_createdAt_idx" ON "PersonaChangeLog"("personaId", "scope", "targetId", "field", "createdAt");

-- CreateIndex
CREATE INDEX "PersonaRelationship_channelId_contactId_idx" ON "PersonaRelationship"("channelId", "contactId");

-- CreateIndex
CREATE INDEX "PersonaRelationship_personaId_updatedAt_idx" ON "PersonaRelationship"("personaId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaRelationship_personaId_contactId_key" ON "PersonaRelationship"("personaId", "contactId");

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
CREATE INDEX "AgentTodo_personaId_status_dueAt_idx" ON "AgentTodo"("personaId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "AgentTodo_personaId_status_createdAt_idx" ON "AgentTodo"("personaId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentIntention_personaId_status_earliestAt_idx" ON "AgentIntention"("personaId", "status", "earliestAt");

-- CreateIndex
CREATE INDEX "AgentRun_personaId_startedAt_idx" ON "AgentRun"("personaId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_conversationId_startedAt_idx" ON "AgentRun"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_focusId_startedAt_idx" ON "AgentRun"("focusId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "MindHeartbeatLog_personaId_createdAt_idx" ON "MindHeartbeatLog"("personaId", "createdAt");

-- CreateIndex
CREATE INDEX "MindHeartbeatLog_channelId_createdAt_idx" ON "MindHeartbeatLog"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "MindHeartbeatLog_runId_idx" ON "MindHeartbeatLog"("runId");

-- CreateIndex
CREATE INDEX "MindLearningLog_personaId_startedAt_idx" ON "MindLearningLog"("personaId", "startedAt");

-- CreateIndex
CREATE INDEX "MindLearningLog_channelId_startedAt_idx" ON "MindLearningLog"("channelId", "startedAt");

-- CreateIndex
CREATE INDEX "PersonaStyleNote_personaId_status_idx" ON "PersonaStyleNote"("personaId", "status");

-- CreateIndex
CREATE INDEX "PersonaStyleNote_channelId_contactId_status_idx" ON "PersonaStyleNote"("channelId", "contactId", "status");

-- CreateIndex
CREATE INDEX "AgentStep_runId_createdAt_idx" ON "AgentStep"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_idempotencyKey_key" ON "AgentAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentAction_personaId_createdAt_idx" ON "AgentAction"("personaId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentAction_status_createdAt_idx" ON "AgentAction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StickerAsset_channelId_enabled_lastUsedAt_idx" ON "StickerAsset"("channelId", "enabled", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StickerAsset_channelId_sha256_key" ON "StickerAsset"("channelId", "sha256");

-- CreateIndex
CREATE INDEX "VideoInsight_lastUsedAt_idx" ON "VideoInsight"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoInsight_platform_videoId_key" ON "VideoInsight"("platform", "videoId");

-- CreateIndex
CREATE INDEX "LlmCallLog_createdAt_idx" ON "LlmCallLog"("createdAt");

-- CreateIndex
CREATE INDEX "LlmCallLog_source_createdAt_idx" ON "LlmCallLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCallLog_runId_createdAt_idx" ON "LlmCallLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCallLog_channelId_createdAt_idx" ON "LlmCallLog"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCallLog_personaId_createdAt_idx" ON "LlmCallLog"("personaId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonaJournal_personaId_createdAt_idx" ON "PersonaJournal"("personaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaJournal_personaId_date_key" ON "PersonaJournal"("personaId", "date");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaVersion" ADD CONSTRAINT "PersonaVersion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "PersonaCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannelPersona" ADD CONSTRAINT "ChatChannelPersona_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatContact" ADD CONSTRAINT "ChatContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatGroupMember" ADD CONSTRAINT "ChatGroupMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatGroupMember" ADD CONSTRAINT "ChatGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRecord" ADD CONSTRAINT "ChatMessageRecord_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRecord" ADD CONSTRAINT "ChatMessageRecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRecord" ADD CONSTRAINT "ChatMessageRecord_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRecord" ADD CONSTRAINT "ChatMessageRecord_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_forwardNodeId_fkey" FOREIGN KEY ("forwardNodeId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "ChatMediaObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatVoiceAsset" ADD CONSTRAINT "ChatVoiceAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatVoiceAsset" ADD CONSTRAINT "ChatVoiceAsset_forwardNodeId_fkey" FOREIGN KEY ("forwardNodeId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForward" ADD CONSTRAINT "ChatForward_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNode" ADD CONSTRAINT "ChatForwardNode_forwardId_fkey" FOREIGN KEY ("forwardId") REFERENCES "ChatForward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNode" ADD CONSTRAINT "ChatForwardNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMindSettings" ADD CONSTRAINT "ChatMindSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaState" ADD CONSTRAINT "PersonaState_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaLongEvent" ADD CONSTRAINT "PersonaLongEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaChangeLog" ADD CONSTRAINT "PersonaChangeLog_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRelationship" ADD CONSTRAINT "PersonaRelationship_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "StickerAsset" ADD CONSTRAINT "StickerAsset_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaJournal" ADD CONSTRAINT "PersonaJournal_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ChatChannelPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaJournal" ADD CONSTRAINT "PersonaJournal_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
