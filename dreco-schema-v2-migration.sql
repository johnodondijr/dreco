-- Dreco schema v2 migration
-- Run this in Supabase SQL Editor to add all columns used by the current app.
-- All statements use ADD COLUMN IF NOT EXISTS so they are safe to re-run.

-- ── Pro candidates ───────────────────────────────────────────────────────────
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS medical     TEXT;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS paid1       NUMERIC;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS paid2       NUMERIC;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS follow_up   TEXT;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS airline     TEXT;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS travel_time  TEXT;
ALTER TABLE pro_candidates ADD COLUMN IF NOT EXISTS travel_notes TEXT;

-- ── General Jobs candidates ──────────────────────────────────────────────────
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS own_passport   BOOLEAN DEFAULT false;
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS follow_up      TEXT;
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS "refundPayments" JSONB DEFAULT '[]';
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS submitted_date TEXT;
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS selected_date  TEXT;
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS passport_date  TEXT;
ALTER TABLE lb_candidates ADD COLUMN IF NOT EXISTS visa_date      TEXT;
