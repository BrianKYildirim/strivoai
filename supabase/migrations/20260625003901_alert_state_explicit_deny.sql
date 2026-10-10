DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.alert_state FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;;
