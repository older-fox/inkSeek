-- CreateTable
CREATE TABLE "ChatGroupPersona" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatGroupPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPrivatePersona" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatPrivatePersona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatGroupPersona_conversationId_key" ON "ChatGroupPersona"("conversationId");

-- CreateIndex
CREATE INDEX "ChatPrivatePersona_contactId_idx" ON "ChatPrivatePersona"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPrivatePersona_channelId_contactId_key" ON "ChatPrivatePersona"("channelId", "contactId");

-- AddForeignKey
ALTER TABLE "ChatGroupPersona" ADD CONSTRAINT "ChatGroupPersona_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPrivatePersona" ADD CONSTRAINT "ChatPrivatePersona_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPrivatePersona" ADD CONSTRAINT "ChatPrivatePersona_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ChatContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
