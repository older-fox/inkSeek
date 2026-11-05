-- Track when the current activity started so prompts can show its age.
ALTER TABLE "PersonaState"
    ADD COLUMN "activitySince" TIMESTAMP(3);
