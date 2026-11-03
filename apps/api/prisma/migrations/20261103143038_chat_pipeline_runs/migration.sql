-- CreateEnum
CREATE TYPE "ChatPipelineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatPipelineNodeStatus" AS ENUM ('SUCCEEDED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ChatPipelineRun" (
    "id" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "graphVersion" INTEGER NOT NULL,
    "status" "ChatPipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "variables" JSONB,

    CONSTRAINT "ChatPipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPipelineNodeRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeVersion" INTEGER NOT NULL,
    "status" "ChatPipelineNodeStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,

    CONSTRAINT "ChatPipelineNodeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatPipelineRun_channelId_startedAt_idx" ON "ChatPipelineRun"("channelId", "startedAt");

-- CreateIndex
CREATE INDEX "ChatPipelineRun_conversationId_startedAt_idx" ON "ChatPipelineRun"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "ChatPipelineRun_messageId_idx" ON "ChatPipelineRun"("messageId");

-- CreateIndex
CREATE INDEX "ChatPipelineRun_startedAt_idx" ON "ChatPipelineRun"("startedAt");

-- CreateIndex
CREATE INDEX "ChatPipelineNodeRun_runId_startedAt_idx" ON "ChatPipelineNodeRun"("runId", "startedAt");

-- AddForeignKey
ALTER TABLE "ChatPipelineRun" ADD CONSTRAINT "ChatPipelineRun_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPipelineRun" ADD CONSTRAINT "ChatPipelineRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPipelineRun" ADD CONSTRAINT "ChatPipelineRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPipelineNodeRun" ADD CONSTRAINT "ChatPipelineNodeRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChatPipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
