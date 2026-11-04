-- The channel persona is the only owner of its own attributes and edit history.
ALTER TABLE "ChatChannelPersona" ADD COLUMN "history" JSONB;

-- Per-person and per-group values live in exactly one row. `extras` keeps the
-- legacy editor fields that do not deserve a first-class column.
ALTER TABLE "PersonaRelationship" ADD COLUMN "extras" JSONB;
ALTER TABLE "PersonaGroupStance" ADD COLUMN "extras" JSONB;

-- Merge the old conversation persona stores into the single-source rows. Only
-- rows that still look untouched are filled, so mind-authored values win.
INSERT INTO "PersonaRelationship" (
  "id", "personaId", "channelId", "contactId",
  "affinity", "trust", "intimacy", "attraction", "hostility", "fear", "respect",
  "obligation", "dependency", "possessiveness", "friction", "unresolvedConflict",
  "familiarity", "relationTags", "addressHere", "publicMask", "boundaries",
  "openPromises", "sharedEvents", "extras", "disclosureScope", "blocked",
  "mutedUntil", "createdAt", "updatedAt"
)
SELECT
  'rel_' || md5(random()::text || clock_timestamp()::text),
  cp."id",
  pp."channelId",
  pp."contactId",
  COALESCE((NULLIF(pp."values"->>'affinity', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'trust', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'intimacy', ''))::numeric, 0)::int,
  0,
  COALESCE((NULLIF(pp."values"->>'hostility', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'fear', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'respect', ''))::numeric, 0)::int,
  0,
  COALESCE((NULLIF(pp."values"->>'dependency', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'possessiveness_obj', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'friction', ''))::numeric, 0)::int,
  COALESCE((NULLIF(pp."values"->>'unresolved_conflict', ''))::numeric, 0)::int,
  20,
  NULLIF(pp."values"->'relation_tags', 'null'::jsonb),
  NULLIF(pp."values"->'how_i_address_here', 'null'::jsonb),
  NULL,
  NULL,
  NULLIF(pp."values"->'open_promises', 'null'::jsonb),
  NULLIF(pp."values"->'shared_events', 'null'::jsonb),
  NULLIF(
    pp."values" - ARRAY[
      'affinity', 'trust', 'intimacy', 'hostility', 'fear', 'respect',
      'dependency', 'possessiveness_obj', 'friction', 'unresolved_conflict',
      'relation_tags', 'how_i_address_here', 'open_promises', 'shared_events',
      'access.blocked', 'access.muted_until', 'disclosure_scope'
    ]::text[],
    '{}'::jsonb
  ),
  CASE
    WHEN jsonb_typeof(pp."values"->'disclosure_scope') = 'array'
      THEN array_to_string(
        ARRAY(SELECT jsonb_array_elements_text(pp."values"->'disclosure_scope')),
        E'\n'
      )
    WHEN jsonb_typeof(pp."values"->'disclosure_scope') = 'string'
      THEN pp."values"->>'disclosure_scope'
    ELSE 'SCENE'
  END,
  COALESCE((NULLIF(pp."values"->>'access.blocked', ''))::boolean, false),
  CASE
    WHEN pp."values"->>'access.muted_until' ~ '^\d{4}-\d{2}-\d{2}'
      THEN (pp."values"->>'access.muted_until')::timestamp
    ELSE NULL
  END,
  pp."createdAt",
  pp."updatedAt"
FROM "ChatPrivatePersona" pp
JOIN "ChatChannelPersona" cp ON cp."channelId" = pp."channelId"
ON CONFLICT ("personaId", "contactId") DO UPDATE SET
  "affinity" = CASE WHEN "PersonaRelationship"."affinity" = 0 THEN EXCLUDED."affinity" ELSE "PersonaRelationship"."affinity" END,
  "trust" = CASE WHEN "PersonaRelationship"."trust" = 0 THEN EXCLUDED."trust" ELSE "PersonaRelationship"."trust" END,
  "intimacy" = CASE WHEN "PersonaRelationship"."intimacy" = 0 THEN EXCLUDED."intimacy" ELSE "PersonaRelationship"."intimacy" END,
  "hostility" = CASE WHEN "PersonaRelationship"."hostility" = 0 THEN EXCLUDED."hostility" ELSE "PersonaRelationship"."hostility" END,
  "fear" = CASE WHEN "PersonaRelationship"."fear" = 0 THEN EXCLUDED."fear" ELSE "PersonaRelationship"."fear" END,
  "respect" = CASE WHEN "PersonaRelationship"."respect" = 0 THEN EXCLUDED."respect" ELSE "PersonaRelationship"."respect" END,
  "dependency" = CASE WHEN "PersonaRelationship"."dependency" = 0 THEN EXCLUDED."dependency" ELSE "PersonaRelationship"."dependency" END,
  "possessiveness" = CASE WHEN "PersonaRelationship"."possessiveness" = 0 THEN EXCLUDED."possessiveness" ELSE "PersonaRelationship"."possessiveness" END,
  "friction" = CASE WHEN "PersonaRelationship"."friction" = 0 THEN EXCLUDED."friction" ELSE "PersonaRelationship"."friction" END,
  "unresolvedConflict" = CASE WHEN "PersonaRelationship"."unresolvedConflict" = 0 THEN EXCLUDED."unresolvedConflict" ELSE "PersonaRelationship"."unresolvedConflict" END,
  "relationTags" = COALESCE("PersonaRelationship"."relationTags", EXCLUDED."relationTags"),
  "addressHere" = COALESCE("PersonaRelationship"."addressHere", EXCLUDED."addressHere"),
  "openPromises" = COALESCE("PersonaRelationship"."openPromises", EXCLUDED."openPromises"),
  "sharedEvents" = COALESCE("PersonaRelationship"."sharedEvents", EXCLUDED."sharedEvents"),
  "extras" = COALESCE("PersonaRelationship"."extras", EXCLUDED."extras"),
  "disclosureScope" = CASE WHEN "PersonaRelationship"."disclosureScope" = 'SCENE' THEN EXCLUDED."disclosureScope" ELSE "PersonaRelationship"."disclosureScope" END,
  "blocked" = "PersonaRelationship"."blocked" OR EXCLUDED."blocked",
  "mutedUntil" = COALESCE("PersonaRelationship"."mutedUntil", EXCLUDED."mutedUntil"),
  "updatedAt" = GREATEST("PersonaRelationship"."updatedAt", EXCLUDED."updatedAt")
WHERE
  "PersonaRelationship"."affinity" = 0
  AND "PersonaRelationship"."trust" = 0
  AND "PersonaRelationship"."intimacy" = 0
  AND "PersonaRelationship"."hostility" = 0
  AND "PersonaRelationship"."fear" = 0
  AND "PersonaRelationship"."respect" = 0
  AND "PersonaRelationship"."dependency" = 0
  AND "PersonaRelationship"."possessiveness" = 0
  AND "PersonaRelationship"."friction" = 0
  AND "PersonaRelationship"."unresolvedConflict" = 0
  AND "PersonaRelationship"."relationTags" IS NULL
  AND "PersonaRelationship"."addressHere" IS NULL
  AND "PersonaRelationship"."openPromises" IS NULL
  AND "PersonaRelationship"."sharedEvents" IS NULL
  AND "PersonaRelationship"."extras" IS NULL;

INSERT INTO "PersonaGroupStance" (
  "id", "personaId", "channelId", "conversationId",
  "comfort", "belonging", "attention", "formality", "speakRate", "audienceRisk",
  "role", "narrative", "boundaries", "tabooTopics", "sceneRules", "mentionOnly",
  "topic", "phase", "extras", "createdAt", "updatedAt"
)
SELECT
  'stance_' || md5(random()::text || clock_timestamp()::text),
  cp."id",
  c."channelId",
  g."conversationId",
  COALESCE((NULLIF(g."values"->>'comfort', ''))::numeric, 50)::int,
  50,
  50,
  COALESCE(ROUND((NULLIF(g."values"->>'formality', ''))::numeric * 100), 50)::int,
  COALESCE(ROUND((NULLIF(g."values"->>'speak_rate_target', ''))::numeric * 100), 50)::int,
  50,
  COALESCE(g."values"->>'group_persona', ''),
  COALESCE(g."values"->>'narrative', ''),
  NULLIF(g."values"->'boundary_here', 'null'::jsonb),
  NULL,
  CASE
    WHEN jsonb_typeof(g."values"->'scene_rules') = 'array'
      THEN array_to_string(
        ARRAY(SELECT jsonb_array_elements_text(g."values"->'scene_rules')),
        '、'
      )
    WHEN jsonb_typeof(g."values"->'scene_rules') = 'string'
      THEN g."values"->>'scene_rules'
    ELSE ''
  END,
  COALESCE((NULLIF(g."values"->>'mention_only', ''))::boolean, false),
  COALESCE(g."values"->>'topic', ''),
  COALESCE(g."values"->>'phase', ''),
  NULLIF(
    g."values" - ARRAY[
      'narrative', 'group_persona', 'comfort', 'boundary_here', 'topic', 'phase',
      'formality', 'scene_rules', 'mention_only', 'speak_rate_target'
    ]::text[],
    '{}'::jsonb
  ),
  g."createdAt",
  g."updatedAt"
FROM "ChatGroupPersona" g
JOIN "ChatConversation" c ON c."id" = g."conversationId"
JOIN "ChatChannelPersona" cp ON cp."channelId" = c."channelId"
ON CONFLICT ("personaId", "conversationId") DO UPDATE SET
  "comfort" = CASE WHEN "PersonaGroupStance"."comfort" = 50 THEN EXCLUDED."comfort" ELSE "PersonaGroupStance"."comfort" END,
  "formality" = CASE WHEN "PersonaGroupStance"."formality" = 50 THEN EXCLUDED."formality" ELSE "PersonaGroupStance"."formality" END,
  "speakRate" = CASE WHEN "PersonaGroupStance"."speakRate" = 50 THEN EXCLUDED."speakRate" ELSE "PersonaGroupStance"."speakRate" END,
  "role" = CASE WHEN "PersonaGroupStance"."role" = '' THEN EXCLUDED."role" ELSE "PersonaGroupStance"."role" END,
  "narrative" = CASE WHEN "PersonaGroupStance"."narrative" = '' THEN EXCLUDED."narrative" ELSE "PersonaGroupStance"."narrative" END,
  "boundaries" = COALESCE("PersonaGroupStance"."boundaries", EXCLUDED."boundaries"),
  "sceneRules" = CASE WHEN "PersonaGroupStance"."sceneRules" = '' THEN EXCLUDED."sceneRules" ELSE "PersonaGroupStance"."sceneRules" END,
  "topic" = CASE WHEN "PersonaGroupStance"."topic" = '' THEN EXCLUDED."topic" ELSE "PersonaGroupStance"."topic" END,
  "phase" = CASE WHEN "PersonaGroupStance"."phase" = '' THEN EXCLUDED."phase" ELSE "PersonaGroupStance"."phase" END,
  "extras" = COALESCE("PersonaGroupStance"."extras", EXCLUDED."extras"),
  "mentionOnly" = "PersonaGroupStance"."mentionOnly" OR EXCLUDED."mentionOnly",
  "updatedAt" = GREATEST("PersonaGroupStance"."updatedAt", EXCLUDED."updatedAt")
WHERE
  "PersonaGroupStance"."comfort" = 50
  AND "PersonaGroupStance"."belonging" = 50
  AND "PersonaGroupStance"."attention" = 50
  AND "PersonaGroupStance"."formality" = 50
  AND "PersonaGroupStance"."speakRate" = 50
  AND "PersonaGroupStance"."audienceRisk" = 50
  AND "PersonaGroupStance"."role" = ''
  AND "PersonaGroupStance"."narrative" = ''
  AND "PersonaGroupStance"."boundaries" IS NULL
  AND "PersonaGroupStance"."tabooTopics" IS NULL
  AND "PersonaGroupStance"."sceneRules" = ''
  AND "PersonaGroupStance"."topic" = ''
  AND "PersonaGroupStance"."phase" = ''
  AND "PersonaGroupStance"."extras" IS NULL;

-- The old conversation-level copies are now redundant.
DROP TABLE "ChatPrivatePersona";
DROP TABLE "ChatGroupPersona";
