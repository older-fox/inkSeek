-- Grooming was previously only a card field. It is a live physical state that
-- changes with events (running outside, showering, tidying), so PersonaState is
-- the single owner. Seed existing rows from the card value when it is numeric.
ALTER TABLE "PersonaState" ADD COLUMN "grooming" INTEGER NOT NULL DEFAULT 70;

UPDATE "PersonaState" AS ps
SET "grooming" = LEAST(100, GREATEST(0, (cp."values" ->> 'grooming')::INTEGER))
FROM "ChatChannelPersona" AS cp
WHERE cp."id" = ps."personaId"
  AND jsonb_typeof(cp."values" -> 'grooming') = 'number';
