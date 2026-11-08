ALTER TABLE "ChatConversation"
  ADD COLUMN "isDirect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "directContactId" TEXT;

CREATE INDEX "ChatConversation_channelId_isDirect_idx"
  ON "ChatConversation"("channelId", "isDirect");
