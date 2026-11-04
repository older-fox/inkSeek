-- AlterTable
ALTER TABLE "ChatMindSettings" ADD COLUMN     "quietIntervalMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "selfScheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wakeIntervalMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "wakeMaxMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "wakeMinMinutes" INTEGER NOT NULL DEFAULT 10;
