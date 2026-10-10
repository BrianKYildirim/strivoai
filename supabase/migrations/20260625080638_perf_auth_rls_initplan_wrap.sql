
-- Phase 9 (09-03) auth_rls_initplan: wrap bare auth.uid() as (select auth.uid()) on all public policies.
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND ( regexp_count(coalesce(qual,''),       'auth\.uid\(\)') > regexp_count(coalesce(qual,''),       'select\s+auth\.uid\(\)', 1, 'i')
          OR regexp_count(coalesce(with_check,''), 'auth\.uid\(\)') > regexp_count(coalesce(with_check,''), 'select\s+auth\.uid\(\)', 1, 'i') )
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I%s%s',
      r.policyname, r.tablename,
      CASE WHEN r.qual       IS NOT NULL THEN format(' USING (%s)',      regexp_replace(r.qual,       'auth\.uid\(\)', '(select auth.uid())', 'g')) ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g')) ELSE '' END
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'auth_rls_initplan: wrapped auth.uid() in (select ...) for % policies', n;
END $$;

DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v
    FROM pg_policies
   WHERE schemaname = 'public'
     AND ( regexp_count(coalesce(qual,''),       'auth\.uid\(\)') > regexp_count(coalesce(qual,''),       'select\s+auth\.uid\(\)', 1, 'i')
        OR regexp_count(coalesce(with_check,''), 'auth\.uid\(\)') > regexp_count(coalesce(with_check,''), 'select\s+auth\.uid\(\)', 1, 'i') );
  IF v <> 0 THEN RAISE EXCEPTION 'auth_rls_initplan: % policy/policies still have an unwrapped auth.uid()', v; END IF;
  RAISE NOTICE 'auth_rls_initplan: every public policy wraps auth.uid() in (select ...)';
END $$;
;
