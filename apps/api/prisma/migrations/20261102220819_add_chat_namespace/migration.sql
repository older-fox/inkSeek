-- CreateEnum
CREATE TYPE "ChatChannelStatus" AS ENUM ('CONNECTING', 'ONLINE', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "ChatConversationKind" AS ENUM ('PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'FACE', 'MIXED', 'SYSTEM');

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'qq',
    "connector" TEXT NOT NULL DEFAULT 'NapCat',
    "displayName" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "signature" TEXT,
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
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageSender" TEXT,
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
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatImageAsset" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "remoteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_platform_accountId_key" ON "ChatChannel"("platform", "accountId");

-- CreateIndex
CREATE INDEX "ChatContact_channelId_idx" ON "ChatContact"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatContact_channelId_externalId_key" ON "ChatContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "ChatConversation_channelId_kind_lastMessageAt_idx" ON "ChatConversation"("channelId", "kind", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_channelId_kind_externalId_key" ON "ChatConversation"("channelId", "kind", "externalId");

-- CreateIndex
CREATE INDEX "ChatGroupMember_conversationId_idx" ON "ChatGroupMember"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatGroupMember_conversationId_contactId_key" ON "ChatGroupMember"("conversationId", "contactId");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_conversationId_sentAt_idx" ON "ChatMessageRecord"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "ChatMessageRecord_channelId_sentAt_idx" ON "ChatMessageRecord"("channelId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageRecord_conversationId_externalId_key" ON "ChatMessageRecord"("conversationId", "externalId");

-- CreateIndex
CREATE INDEX "ChatImageAsset_messageId_idx" ON "ChatImageAsset"("messageId");

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
ALTER TABLE "ChatImageAsset" ADD CONSTRAINT "ChatImageAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
