-- Dreco security hardening migration (from audit: H3, H4, M2)
-- Run in the Supabase SQL editor. Safe to re-run (idempotent guards used).
--
-- IMPORTANT manual step for H3 (do this first, in the dashboard):
--   Storage → candidate-documents bucket → make it PRIVATE (turn off "Public").
--   Public buckets expose passport/ID scans at guessable URLs. The app now
--   generates a short-lived signed URL per view instead of a public URL.

-- ─────────────────────────────────────────────────────────────────────────────
-- H3 — Storage RLS: a company may only touch objects under its own company_id
-- folder. Object paths are `{company_id}/{type}/{id}/{docType}/{ts}-{file}`, so
-- the first path segment is the company_id.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members read own documents"   ON storage.objects;
DROP POLICY IF EXISTS "Company members write own documents"  ON storage.objects;
DROP POLICY IF EXISTS "Company members update own documents"  ON storage.objects;
DROP POLICY IF EXISTS "Company members delete own documents"  ON storage.objects;

CREATE POLICY "Company members read own documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id')
);

CREATE POLICY "Company members write own documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id')
);

CREATE POLICY "Company members update own documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id')
)
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id')
);

CREATE POLICY "Company members delete own documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (storage.foldername(name))[1] = ((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- H4 — Role-aware RLS: any authenticated company member may read/insert/update
-- their company's rows, but only admins may DELETE. This replaces the single
-- "FOR ALL" policy (which let any member delete anything).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  jwt_company text := '((SELECT auth.jwt()) -> ''app_metadata'' ->> ''company_id'')';
  jwt_role    text := '((SELECT auth.jwt()) -> ''app_metadata'' ->> ''role'')';
BEGIN
  FOREACH tbl IN ARRAY ARRAY['pro_candidates','lb_candidates','documents','timelines','app_settings']
  LOOP
    -- Drop the permissive FOR ALL policy from the previous migration.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
      CASE tbl
        WHEN 'pro_candidates' THEN 'Company members can manage professional candidates'
        WHEN 'lb_candidates'  THEN 'Company members can manage general jobs candidates'
        WHEN 'documents'      THEN 'Company members can manage documents'
        WHEN 'timelines'      THEN 'Company members can manage timelines'
        WHEN 'app_settings'   THEN 'Company members can manage app settings'
      END, tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl||'_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl||'_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl||'_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl||'_delete', tbl);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id = %s)',
      tbl||'_select', tbl, jwt_company);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (company_id = %s)',
      tbl||'_insert', tbl, jwt_company);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (company_id = %s) WITH CHECK (company_id = %s)',
      tbl||'_update', tbl, jwt_company, jwt_company);
    -- DELETE restricted to admins of the same company.
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (company_id = %s AND %s = ''admin'')',
      tbl||'_delete', tbl, jwt_company, jwt_role);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- M2 — Defense-in-depth financial constraints, so a bypassed client cannot
-- write negative/garbage money values directly through the API.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pro_candidates DROP CONSTRAINT IF EXISTS pro_paid_nonneg;
ALTER TABLE pro_candidates ADD  CONSTRAINT pro_paid_nonneg CHECK (paid IS NULL OR paid >= 0);
ALTER TABLE pro_candidates DROP CONSTRAINT IF EXISTS pro_commission_nonneg;
ALTER TABLE pro_candidates ADD  CONSTRAINT pro_commission_nonneg CHECK (commission IS NULL OR commission >= 0);

ALTER TABLE lb_candidates DROP CONSTRAINT IF EXISTS lb_r1_nonneg;
ALTER TABLE lb_candidates ADD  CONSTRAINT lb_r1_nonneg CHECK ("r1Amt" IS NULL OR "r1Amt" >= 0);
ALTER TABLE lb_candidates DROP CONSTRAINT IF EXISTS lb_r2_nonneg;
ALTER TABLE lb_candidates ADD  CONSTRAINT lb_r2_nonneg CHECK ("r2Amt" IS NULL OR "r2Amt" >= 0);
