-- Consolidate LLM call logging into one table. Raw prompt/response text stays
-- on the newest 200 calls; attributed rows outside a run survive as usage.
ALTER TABLE "LlmPromptLog" RENAME TO "LlmCallLog";
ALTER INDEX "LlmPromptLog_createdAt_idx" RENAME TO "LlmCallLog_createdAt_idx";
ALTER INDEX "LlmPromptLog_source_createdAt_idx" RENAME TO "LlmCallLog_source_createdAt_idx";
ALTER INDEX "LlmPromptLog_runId_createdAt_idx" RENAME TO "LlmCallLog_runId_createdAt_idx";

ALTER TABLE "LlmCallLog"
  ADD COLUMN "channelId" TEXT,
  ADD COLUMN "personaId" TEXT;

ALTER TABLE "LlmCallLog" ALTER COLUMN "prompt" DROP NOT NULL;
ALTER TABLE "LlmCallLog" ALTER COLUMN "response" DROP NOT NULL;
ALTER TABLE "LlmCallLog" ALTER COLUMN "response" DROP DEFAULT;

INSERT INTO "LlmCallLog" (
  "id",
  "runId",
  "channelId",
  "personaId",
  "source",
  "providerId",
  "providerName",
  "model",
  "system",
  "prompt",
  "response",
  "imageCount",
  "promptTokens",
  "completionTokens",
  "latencyMs",
  "error",
  "createdAt"
)
SELECT
  "id",
  NULL,
  "channelId",
  "personaId",
  "source",
  NULL,
  NULL,
  "model",
  '',
  NULL,
  NULL,
  "imageCount",
  "promptTokens",
  "completionTokens",
  NULL,
  NULL,
  "createdAt"
FROM "LlmUsageLog";

DROP TABLE "LlmUsageLog";

CREATE INDEX "LlmCallLog_channelId_createdAt_idx" ON "LlmCallLog" ("channelId", "createdAt");
CREATE INDEX "LlmCallLog_personaId_createdAt_idx" ON "LlmCallLog" ("personaId", "createdAt");

-- Merge forward-node attachments into the message attachment tables. One table
-- now covers both owners; the check constraint keeps exactly one owner set.
ALTER TABLE "ChatImageAsset" ALTER COLUMN "messageId" DROP NOT NULL;
ALTER TABLE "ChatImageAsset" ADD COLUMN "forwardNodeId" TEXT;

ALTER TABLE "ChatVoiceAsset" ALTER COLUMN "messageId" DROP NOT NULL;
ALTER TABLE "ChatVoiceAsset" ADD COLUMN "forwardNodeId" TEXT;

INSERT INTO "ChatImageAsset" (
  "id",
  "messageId",
  "forwardNodeId",
  "mediaId",
  "url",
  "fileName",
  "mimeType",
  "byteSize",
  "width",
  "height",
  "remoteUrl",
  "position",
  "createdAt"
)
SELECT
  "id",
  NULL,
  "nodeId",
  "mediaId",
  "url",
  "fileName",
  "mimeType",
  "byteSize",
  "width",
  "height",
  "remoteUrl",
  "position",
  "createdAt"
FROM "ChatForwardNodeImage";

INSERT INTO "ChatVoiceAsset" (
  "id",
  "messageId",
  "forwardNodeId",
  "url",
  "fileName",
  "mimeType",
  "byteSize",
  "duration",
  "description",
  "remoteUrl",
  "position",
  "createdAt"
)
SELECT
  "id",
  NULL,
  "nodeId",
  "url",
  "fileName",
  "mimeType",
  "byteSize",
  "duration",
  NULL,
  "remoteUrl",
  "position",
  "createdAt"
FROM "ChatForwardNodeVoice";

DROP TABLE "ChatForwardNodeImage";
DROP TABLE "ChatForwardNodeVoice";

ALTER TABLE "ChatImageAsset"
  ADD CONSTRAINT "ChatImageAsset_forwardNodeId_fkey"
  FOREIGN KEY ("forwardNodeId") REFERENCES "ChatForwardNode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatVoiceAsset"
  ADD CONSTRAINT "ChatVoiceAsset_forwardNodeId_fkey"
  FOREIGN KEY ("forwardNodeId") REFERENCES "ChatForwardNode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChatImageAsset_forwardNodeId_position_idx"
  ON "ChatImageAsset" ("forwardNodeId", "position");
CREATE INDEX "ChatVoiceAsset_forwardNodeId_position_idx"
  ON "ChatVoiceAsset" ("forwardNodeId", "position");

ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_owner_check"
  CHECK (("messageId" IS NOT NULL)::int + ("forwardNodeId" IS NOT NULL)::int = 1);
ALTER TABLE "ChatVoiceAsset" ADD CONSTRAINT "ChatVoiceAsset_owner_check"
  CHECK (("messageId" IS NOT NULL)::int + ("forwardNodeId" IS NOT NULL)::int = 1);

-- Redundant indexes: each is a prefix of an existing unique index, or unused.
DROP INDEX "PersonaVersion_personaId_version_idx";
DROP INDEX "ChatContact_channelId_idx";
DROP INDEX "ChatGroupMember_conversationId_idx";
DROP INDEX "ChatMessageRecord_replyToExternalId_idx";

-- Dead columns: never written or never read.
ALTER TABLE "AgentRun" DROP COLUMN "cost";
ALTER TABLE "ChatMessageRecord" DROP COLUMN "receivedAt";
