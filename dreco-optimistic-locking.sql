-- Dreco optimistic locking (audit M3 — lost updates).
-- Adds an updated_at column that is auto-bumped on every UPDATE. The client
-- uses it to detect when a candidate was changed by someone else since the
-- edit form was opened, and prompts before overwriting.
--
-- Safe to run anytime: the client guard is inert until this column exists, so
-- deploying the app code before running this changes nothing.

ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lb_candidates  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION dreco_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pro_candidates_set_updated_at ON pro_candidates;
CREATE TRIGGER pro_candidates_set_updated_at
  BEFORE UPDATE ON pro_candidates
  FOR EACH ROW EXECUTE FUNCTION dreco_set_updated_at();

DROP TRIGGER IF EXISTS lb_candidates_set_updated_at ON lb_candidates;
CREATE TRIGGER lb_candidates_set_updated_at
  BEFORE UPDATE ON lb_candidates
  FOR EACH ROW EXECUTE FUNCTION dreco_set_updated_at();
