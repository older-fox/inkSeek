-- CreateEnum
CREATE TYPE "ChatForwardSource" AS ENUM ('INLINE', 'FETCHED');

-- CreateEnum
CREATE TYPE "ChatForwardStatus" AS ENUM ('COMPLETE', 'TRUNCATED', 'FAILED');

-- AlterEnum
ALTER TYPE "ChatMessageKind" ADD VALUE 'FORWARD';

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
CREATE TABLE "ChatForwardNodeImage" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "remoteUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatForwardNodeImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatForwardNodeVoice" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "duration" INTEGER,
    "remoteUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatForwardNodeVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatForward_messageId_key" ON "ChatForward"("messageId");

-- CreateIndex
CREATE INDEX "ChatForward_forwardId_idx" ON "ChatForward"("forwardId");

-- CreateIndex
CREATE INDEX "ChatForwardNode_forwardId_parentId_position_idx" ON "ChatForwardNode"("forwardId", "parentId", "position");

-- CreateIndex
CREATE INDEX "ChatForwardNodeImage_nodeId_position_idx" ON "ChatForwardNodeImage"("nodeId", "position");

-- CreateIndex
CREATE INDEX "ChatForwardNodeVoice_nodeId_position_idx" ON "ChatForwardNodeVoice"("nodeId", "position");

-- AddForeignKey
ALTER TABLE "ChatForward" ADD CONSTRAINT "ChatForward_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNode" ADD CONSTRAINT "ChatForwardNode_forwardId_fkey" FOREIGN KEY ("forwardId") REFERENCES "ChatForward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNode" ADD CONSTRAINT "ChatForwardNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNodeImage" ADD CONSTRAINT "ChatForwardNodeImage_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatForwardNodeVoice" ADD CONSTRAINT "ChatForwardNodeVoice_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ChatForwardNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
