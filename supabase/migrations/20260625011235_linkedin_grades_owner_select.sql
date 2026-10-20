DROP POLICY IF EXISTS "Anyone can view linkedin grades" ON public.linkedin_grades;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'linkedin_grades'
     AND cmd = 'SELECT'
     AND qual = 'true';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'linkedin_grades still has an unscoped (USING true) SELECT policy (found %)', v_count;
  END IF;
  RAISE NOTICE 'linkedin_grades SELECT is owner-scoped; no unscoped public SELECT remains';
END $$;;
