<#
.SYNOPSIS
  Phase 10 - verify merit ledger schema shape, CHECK constraints, and backfill invariant.
  Covers MER-01, MER-02, MER-03 (column shapes), MER-13 (no negative balances),
  MER-10 (signup grants 5 subscription merits), MER-14 (lifetime_granted seeded at 5).

.DESCRIPTION
  Runs three DO assertion blocks against the live DB via psql:
    Block 1 (SC-1): information_schema.columns shape for all 3 merit tables
    Block 2 (SC-3): CHECK constraint enforcement - UPDATE to -1 must raise check_violation
    Block 3 (SC-4): backfill invariant - every profile row has a user_merits row
                    with subscription_balance=5, shop_balance=0, lifetime_granted=5

  If SUPABASE_DB_URL is not set, the script emits a skip notice and exits 0
  (same fail-soft posture as scripts/snapshot-legacy-tables.ps1).

.PARAMETER DatabaseUrl
  Postgres connection string. Defaults to $env:SUPABASE_DB_URL.

.EXAMPLE
  $env:SUPABASE_DB_URL = "postgres://..."
  .\scripts\verify-merit-schema.ps1

.EXAMPLE
  .\scripts\verify-merit-schema.ps1 -DatabaseUrl "postgres://postgres:password@localhost:54322/postgres"
#>

param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Env guard - skip cleanly when no DB URL is available
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Host "[SKIP] SUPABASE_DB_URL is not set. Set it to a Postgres connection string and re-run."
  Write-Host "       Example: set SUPABASE_DB_URL=postgres://postgres:password@localhost:54322/postgres"
  Write-Host "       Skipping verify-merit-schema.ps1 - no DB assertions run."
  exit 0
}

Write-Host "verify-merit-schema.ps1 - running against DB (URL redacted)"
Write-Host ""

# Helper: write SQL to a temp file, run via psql with ON_ERROR_STOP, assert exit 0
function Invoke-PsqlBlock {
  param(
    [string]$Label,
    [string]$Sql
  )
  Write-Host "--- $Label ---"
  $tmpFile = [System.IO.Path]::GetTempFileName() + ".sql"
  try {
    [System.IO.File]::WriteAllText($tmpFile, $Sql, [System.Text.Encoding]::UTF8)
    & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $tmpFile
    $psqlExit = $LASTEXITCODE
  } finally {
    Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
  }
  if ($psqlExit -ne 0) {
    Write-Error "$Label FAILED (psql exit $psqlExit)"
    exit $psqlExit
  }
  Write-Host ""
}

# =============================================================================
# Block 1: SC-1 - column shape for user_merits, merit_transactions,
#          merit_shop_purchases  (MER-01, MER-02, MER-03)
# Expected column sets include the live shape after
# supabase/migrations/20260801000000_remove_linkedin_free_scan.sql.
# =============================================================================
$sc1Sql = @'
DO $$
DECLARE
  expected_cols text[];
  actual_cols   text[];
BEGIN
  -- user_merits (8 columns)
  SELECT array_agg(c ORDER BY c) INTO expected_cols FROM (VALUES
    ('created_at|timestamp with time zone|NO'),
    ('id|uuid|NO'),
    ('lifetime_granted|integer|NO'),
    ('shop_balance|integer|NO'),
    ('subscription_balance|integer|NO'),
    ('subscription_reset_date|timestamp with time zone|YES'),
    ('updated_at|timestamp with time zone|NO'),
    ('user_id|uuid|NO')
  ) AS t(c);

  SELECT array_agg(column_name || '|' || data_type || '|' || is_nullable
         ORDER BY column_name || '|' || data_type || '|' || is_nullable)
    INTO actual_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_merits';

  IF actual_cols IS DISTINCT FROM expected_cols THEN
    RAISE EXCEPTION 'SC-1 FAIL user_merits: expected % got %', expected_cols, actual_cols;
  END IF;

  -- merit_transactions (8 columns)
  SELECT array_agg(c ORDER BY c) INTO expected_cols FROM (VALUES
    ('amount|integer|NO'),
    ('balance_type|text|NO'),
    ('created_at|timestamp with time zone|NO'),
    ('feature|text|YES'),
    ('id|uuid|NO'),
    ('metadata|jsonb|NO'),
    ('source|text|NO'),
    ('user_id|uuid|NO')
  ) AS t(c);

  SELECT array_agg(column_name || '|' || data_type || '|' || is_nullable
         ORDER BY column_name || '|' || data_type || '|' || is_nullable)
    INTO actual_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merit_transactions';

  IF actual_cols IS DISTINCT FROM expected_cols THEN
    RAISE EXCEPTION 'SC-1 FAIL merit_transactions: expected % got %', expected_cols, actual_cols;
  END IF;

  -- merit_shop_purchases (8 columns)
  SELECT array_agg(c ORDER BY c) INTO expected_cols FROM (VALUES
    ('created_at|timestamp with time zone|NO'),
    ('id|uuid|NO'),
    ('pack_size|integer|NO'),
    ('price_cents|integer|NO'),
    ('status|text|NO'),
    ('stripe_payment_intent_id|text|NO'),
    ('stripe_receipt_url|text|YES'),
    ('user_id|uuid|NO')
  ) AS t(c);

  SELECT array_agg(column_name || '|' || data_type || '|' || is_nullable
         ORDER BY column_name || '|' || data_type || '|' || is_nullable)
    INTO actual_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merit_shop_purchases';

  IF actual_cols IS DISTINCT FROM expected_cols THEN
    RAISE EXCEPTION 'SC-1 FAIL merit_shop_purchases: expected % got %', expected_cols, actual_cols;
  END IF;

  RAISE NOTICE 'SC-1 PASS: all 3 tables have exact column shapes (MER-01, MER-02, MER-03)';
END $$;
'@

Invoke-PsqlBlock -Label "SC-1 (MER-01, MER-02, MER-03): column shape" -Sql $sc1Sql

# =============================================================================
# Block 2: SC-3 - CHECK constraint enforcement  (MER-13)
# Attempts UPDATE to subscription_balance=-1 and shop_balance=-1 on any
# existing user_merits row. Both must raise check_violation. The inner
# BEGIN/EXCEPTION subtransaction rolls back the mutation so the row is never
# actually changed. If no rows exist (empty DB) the block emits SC-3 SKIP.
# =============================================================================
$sc3Sql = @'
DO $$
DECLARE
  any_user_id uuid;
  err_caught  boolean := false;
BEGIN
  SELECT user_id INTO any_user_id FROM public.user_merits LIMIT 1;
  IF any_user_id IS NULL THEN
    RAISE NOTICE 'SC-3 SKIP: no user_merits rows to test against (empty profiles table)';
    RETURN;
  END IF;

  -- Test subscription_balance >= 0 CHECK
  BEGIN
    UPDATE public.user_merits
      SET subscription_balance = -1
    WHERE user_id = any_user_id;
  EXCEPTION WHEN check_violation THEN
    err_caught := true;
  END;
  IF NOT err_caught THEN
    RAISE EXCEPTION 'SC-3 FAIL subscription_balance: UPDATE to -1 did not raise check_violation';
  END IF;

  -- Test shop_balance >= 0 CHECK
  err_caught := false;
  BEGIN
    UPDATE public.user_merits
      SET shop_balance = -1
    WHERE user_id = any_user_id;
  EXCEPTION WHEN check_violation THEN
    err_caught := true;
  END;
  IF NOT err_caught THEN
    RAISE EXCEPTION 'SC-3 FAIL shop_balance: UPDATE to -1 did not raise check_violation';
  END IF;

  RAISE NOTICE 'SC-3 PASS: CHECK constraints block negative balances (MER-13)';
END $$;
'@

Invoke-PsqlBlock -Label "SC-3 (MER-13): CHECK constraint enforcement" -Sql $sc3Sql

# =============================================================================
# Block 3: SC-4 - backfill + trigger invariant  (MER-10, MER-14)
# Every profile must have exactly one user_merits row seeded to
# (subscription_balance=5, shop_balance=0, lifetime_granted=5) by either the
# Phase 10 backfill or the on_profile_created_provision_merits trigger.
# Also asserts at least one grant transaction row per profile exists.
# =============================================================================
$sc4Sql = @'
DO $$
DECLARE
  profile_count  integer;
  merit_count    integer;
  correct_shape  integer;
  grant_count    integer;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO merit_count   FROM public.user_merits;
  SELECT COUNT(*) INTO correct_shape
    FROM public.user_merits
    WHERE subscription_balance = 5
      AND shop_balance = 0
      AND lifetime_granted = 5;
  SELECT COUNT(*) INTO grant_count
    FROM public.merit_transactions
    WHERE source IN ('phase-10-backfill', 'signup-grant');

  RAISE NOTICE 'profiles=% user_merits=% correct_shape(5,0,5)=% grant_rows=%',
    profile_count, merit_count, correct_shape, grant_count;

  IF profile_count = 0 THEN
    RAISE NOTICE 'SC-4 SKIP: no profiles in DB (empty staging environment)';
    RETURN;
  END IF;

  IF profile_count <> merit_count THEN
    RAISE EXCEPTION 'SC-4 FAIL: profile_count(%) != user_merits count(%)',
      profile_count, merit_count;
  END IF;

  IF profile_count <> correct_shape THEN
    RAISE EXCEPTION 'SC-4 FAIL: % profiles but only % user_merits with (sub=5, shop=0, lifetime=5)',
      profile_count, correct_shape;
  END IF;

  IF grant_count < profile_count THEN
    RAISE EXCEPTION 'SC-4 FAIL: % profiles but only % grant rows in merit_transactions',
      profile_count, grant_count;
  END IF;

  RAISE NOTICE 'SC-4 PASS: backfill invariant holds - signup grants 5 sub merits + lifetime_granted=5 (MER-10, MER-14)';
END $$;
'@

Invoke-PsqlBlock -Label "SC-4 (MER-10, MER-14): backfill + trigger invariant" -Sql $sc4Sql

# All blocks passed
Write-Host "verify-merit-schema.ps1 PASSED: SC-1 (MER-01, MER-02, MER-03), SC-3 (MER-13), SC-4 (MER-10, MER-14) all green."
exit 0
