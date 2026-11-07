-- Stale-memory review rotates through old rows without touching
-- lastRecalledAt, which the decay job and archive pool both depend on.

ALTER TABLE "PersonaMemory" ADD COLUMN "staleReviewedAt" TIMESTAMP(3);
