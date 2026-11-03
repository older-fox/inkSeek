-- AlterTable
ALTER TABLE "ChatPipelineGraph" ADD COLUMN "variables" JSONB;

-- AlterTable
ALTER TABLE "ChatPipelineRun" ADD COLUMN "variableValues" JSONB;
