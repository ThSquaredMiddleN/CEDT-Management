CREATE TABLE "course_change_settings_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "term_id" UUID NOT NULL REFERENCES "terms"("id"),
  "actor_id" UUID NOT NULL REFERENCES "users"("id"),
  "reason" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "course_change_settings_events_term_id_created_at_idx"
  ON "course_change_settings_events"("term_id", "created_at" DESC);
