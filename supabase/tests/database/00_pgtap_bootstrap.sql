-- pgTAP bootstrap — loaded by `supabase db test` against ephemeral local DB.
-- Per Phase 11 D-25, this file lives OUTSIDE supabase/migrations/ and never ships to prod.
CREATE EXTENSION IF NOT EXISTS pgtap;
BEGIN;
SELECT plan(1);
SELECT pass('pgTAP bootstrap loaded');
SELECT * FROM finish();
ROLLBACK;
