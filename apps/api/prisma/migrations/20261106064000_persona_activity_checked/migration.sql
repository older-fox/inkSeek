-- Last stale-activity review marker; avoids re-asking the model every heartbeat.
ALTER TABLE "PersonaState" ADD COLUMN "activityCheckedAt" TIMESTAMP(3);
