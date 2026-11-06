-- Phone control is channel-scoped and wireless-only. The old global selection
-- key is no longer read; keep the setting table clean.
ALTER TABLE "ChatMindSettings" ADD COLUMN "phoneDevice" TEXT;

DELETE FROM "SystemConfig" WHERE "key" = 'phone.device';
