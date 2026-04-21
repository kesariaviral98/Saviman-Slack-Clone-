-- ─────────────────────────────────────────────────────────────────────────────
-- Full-text search setup for the Message table.
--
-- APPLY AFTER running `prisma migrate dev`:
--   pnpm --filter @teamchat/server run db:search-setup
--
-- Or manually:
--   psql $DATABASE_URL < prisma/migrations/search_setup.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- GIN index on the tsvector column for fast full-text search.
CREATE INDEX IF NOT EXISTS messages_search_idx
  ON "Message" USING GIN ("searchVec");

-- Function: recomputes tsvector on INSERT or UPDATE.
CREATE OR REPLACE FUNCTION messages_search_update()
RETURNS trigger AS $$
BEGIN
  NEW."searchVec" := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Drop existing trigger (idempotent) before recreating.
DROP TRIGGER IF EXISTS messages_search_trigger ON "Message";

-- Trigger: fires BEFORE INSERT OR UPDATE on every row.
CREATE TRIGGER messages_search_trigger
  BEFORE INSERT OR UPDATE ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION messages_search_update();

-- Backfill existing rows (runs once; safe to re-run).
UPDATE "Message"
SET "searchVec" = to_tsvector('english', coalesce(content, ''))
WHERE "searchVec" IS NULL;
