# Recruitflow Supabase + Vercel Setup Guide

## What Supabase Does

Supabase stores Recruitflow data in the cloud so every authorized user in the same company workspace sees the same candidates, payments, timelines, documents, and settings.

## Step 1 - Create Your Supabase Project

1. Go to `https://supabase.com` and create a new project.
2. Save the database password somewhere secure.
3. Choose the nearest region for your team.
4. Wait for the project to finish provisioning.

## Step 2 - Add Vercel Environment Variables

Do not paste Supabase keys into `app.js`, `index.html`, or `data.js`.

In Vercel, open the Recruitflow project, then go to **Settings -> Environment Variables** and add:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

DRECO_DEFAULT_COMPANY_ID=destiny-recruitment-consults
DRECO_DEFAULT_COMPANY_NAME=Destiny Recruit Consults
DRECO_DEFAULT_ADMIN_USERNAME=johnfred
DRECO_GENERAL_JOBS_COUNTRIES=Lebanon,Oman,Saudi Arabia
DRECO_RECOVERY_CODE=choose-a-private-recovery-code
DRECO_RETIRED_USERNAMES=fred,robert,doreen,maxwell,consolata
DRECO_BLOCKED_ADMIN_ALIASES=john_fred,john-fred,john.fred
```

For another recruitment company, change the `DRECO_*` values to that company's workspace name, first admin username, and destination countries.

Security notes:

- `SUPABASE_ANON_KEY` is browser-safe, but Recruitflow now serves it through `/api/dreco-config` instead of hardcoding it.
- `SUPABASE_SERVICE_ROLE_KEY` must stay private in Vercel only.
- `DRECO_RECOVERY_CODE` must stay private in Vercel only.

After adding or changing env vars, redeploy the Vercel project.

## Step 3 - Create the Database Tables

In Supabase, open **SQL Editor**, create a new query, paste this SQL, and run it:

```sql
CREATE TABLE pro_candidates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  pp          TEXT,
  phone       TEXT,
  position    TEXT,
  company     TEXT,
  country     TEXT,
  stage       TEXT DEFAULT 'PENDING OFFER LETTER',
  submitted   TEXT,
  interview   TEXT,
  ol          TEXT,
  mol         TEXT,
  visa        TEXT,
  travel      TEXT,
  commission  NUMERIC,
  paid        NUMERIC,
  company_id  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lb_candidates (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT,
  "ppStatus"     TEXT DEFAULT 'APPLIED',
  "travelStatus" TEXT DEFAULT 'NOT YET',
  "travelDate"   TEXT,
  "toRefund"     NUMERIC DEFAULT 0,
  "r1Date"       TEXT,
  "r1Amt"        NUMERIC DEFAULT 0,
  "r2Date"       TEXT,
  "r2Amt"        NUMERIC DEFAULT 0,
  notes          TEXT,
  company_id     TEXT,
  country        TEXT DEFAULT 'General',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documents (
  key   TEXT PRIMARY KEY,
  data  JSONB
);

CREATE TABLE timelines (
  key      TEXT PRIMARY KEY,
  entries  JSONB
);

CREATE TABLE app_settings (
  key    TEXT PRIMARY KEY,
  value  JSONB
);

ALTER TABLE pro_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lb_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON pro_candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON lb_candidates  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON documents      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON timelines      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON app_settings   FOR ALL USING (true) WITH CHECK (true);
```

You should see **Success. No rows returned**.

## Step 4 - Existing Database Migration

If the tables already exist, run this once instead of recreating them:

```sql
ALTER TABLE pro_candidates
  ADD COLUMN IF NOT EXISTS company_id TEXT;

ALTER TABLE lb_candidates
  ADD COLUMN IF NOT EXISTS company_id TEXT;

ALTER TABLE lb_candidates
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'General';

CREATE INDEX IF NOT EXISTS pro_candidates_company_id_idx
  ON pro_candidates(company_id);

CREATE INDEX IF NOT EXISTS lb_candidates_company_id_idx
  ON lb_candidates(company_id);

CREATE INDEX IF NOT EXISTS lb_candidates_company_country_idx
  ON lb_candidates(company_id, country);
```

For the current Destiny workspace, records should use:

```sql
UPDATE pro_candidates
SET company_id = 'destiny-recruitment-consults'
WHERE company_id IS NULL;

UPDATE lb_candidates
SET company_id = 'destiny-recruitment-consults'
WHERE company_id IS NULL;
```

## Step 5 - Deploy Updated Files

Upload or replace these files in GitHub:

```text
index.html
app.js
data.js
api/dreco-auth.js
api/dreco-config.js
```

Vercel should redeploy automatically.

## Step 6 - Activate the Default Admin

After deployment:

1. Open Recruitflow.
2. Click **Create company workspace**.
3. Enter the company name, admin name, admin username, and admin password.
4. Sign out.
5. Sign back in using the admin username and password.

For Destiny, use the env values shown above so the default admin is `johnfred` and the company name is `Destiny Recruit Consults`.

## Staff Access

Each company workspace starts with an admin. The admin can add other users from **Settings -> Company users**. Those users are linked to the same company workspace as the admin who created them.

Admins can manage General Jobs destination countries from **Settings -> General Jobs countries**. The country tabs inside General Jobs use the same saved company configuration.

Old usernames can be retired with `DRECO_RETIRED_USERNAMES`, and blocked login aliases can be set with `DRECO_BLOCKED_ADMIN_ALIASES`.

## Recovery

The recovery screen checks `DRECO_RECOVERY_CODE` through `/api/dreco-auth`. It does not display passwords in the browser.

An administrator should reset staff credentials from the account workflow.

## Troubleshooting

**App stays in local mode**: confirm `SUPABASE_URL` and `SUPABASE_ANON_KEY` exist in Vercel, then redeploy.

**Create workspace fails**: confirm `SUPABASE_SERVICE_ROLE_KEY` exists in Vercel.

**Data not showing**: confirm candidate rows have the correct `company_id`.

**Old username still logs in**: add it to `DRECO_RETIRED_USERNAMES` or `DRECO_BLOCKED_ADMIN_ALIASES`, redeploy, then sign in again.
