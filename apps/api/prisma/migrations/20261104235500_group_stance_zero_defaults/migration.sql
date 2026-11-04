-- Group stance is emergent, not a pre-judged 50/50 baseline. New rows start at
-- zero and adapt through turns/heartbeats.
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "comfort" SET DEFAULT 0;
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "belonging" SET DEFAULT 0;
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "attention" SET DEFAULT 0;
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "formality" SET DEFAULT 0;
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "speakRate" SET DEFAULT 0;
ALTER TABLE "PersonaGroupStance" ALTER COLUMN "audienceRisk" SET DEFAULT 0;

-- Rows still carrying the old untouched default (all six exactly 50) are reset.
-- Any group the operator or agent already adjusted is left alone.
UPDATE "PersonaGroupStance"
SET "comfort" = 0,
    "belonging" = 0,
    "attention" = 0,
    "formality" = 0,
    "speakRate" = 0,
    "audienceRisk" = 0
WHERE "comfort" = 50
  AND "belonging" = 50
  AND "attention" = 50
  AND "formality" = 50
  AND "speakRate" = 50
  AND "audienceRisk" = 50;
