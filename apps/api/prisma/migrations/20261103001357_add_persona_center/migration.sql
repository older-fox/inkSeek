-- CreateTable
CREATE TABLE "PersonaCard" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occupation" TEXT NOT NULL DEFAULT '',
    "age" INTEGER NOT NULL DEFAULT 0,
    "profile" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaVersion" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonaCard_serial_key" ON "PersonaCard"("serial");

-- CreateIndex
CREATE INDEX "PersonaCard_name_idx" ON "PersonaCard"("name");

-- CreateIndex
CREATE INDEX "PersonaCard_updatedAt_idx" ON "PersonaCard"("updatedAt");

-- CreateIndex
CREATE INDEX "PersonaVersion_personaId_version_idx" ON "PersonaVersion"("personaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaVersion_personaId_version_key" ON "PersonaVersion"("personaId", "version");

-- AddForeignKey
ALTER TABLE "PersonaVersion" ADD CONSTRAINT "PersonaVersion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "PersonaCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
