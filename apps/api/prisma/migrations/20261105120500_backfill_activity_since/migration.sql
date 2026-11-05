-- Backfill activitySince for personas that already have an activity.
-- Prefer the last logged change to that exact activity; fall back to the
-- state row's updatedAt so the prompt can still show an approximate age.
UPDATE "PersonaState" ps
SET "activitySince" = COALESCE(
    (
        SELECT MAX(l."createdAt")
        FROM "PersonaChangeLog" l
        WHERE l."personaId" = ps."personaId"
          AND l."field" = 'currentActivity'
          AND l."afterValue" = to_jsonb(ps."currentActivity")
    ),
    ps."updatedAt"
)
WHERE ps."currentActivity" <> '';
