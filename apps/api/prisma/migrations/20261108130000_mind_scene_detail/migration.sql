-- Scene prose mode per channel: OFF keeps chat-only replies, ACTION allows
-- short stage directions, EXPLICIT expands a scene cue into detailed prose.
CREATE TYPE "MindSceneDetail" AS ENUM ('OFF', 'ACTION', 'EXPLICIT');

ALTER TABLE "ChatMindSettings"
  ADD COLUMN "sceneDetail" "MindSceneDetail" NOT NULL DEFAULT 'OFF';
