-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChatPipelineNodeStatus" ADD VALUE 'RUNNING';
ALTER TYPE "ChatPipelineNodeStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "ChatPipelineRunStatus" ADD VALUE 'INTERRUPTED';

-- AlterTable
ALTER TABLE "ChatPipelineGraph" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ChatPipelineNodeRun" ALTER COLUMN "finishedAt" DROP NOT NULL,
ALTER COLUMN "durationMs" DROP NOT NULL;
