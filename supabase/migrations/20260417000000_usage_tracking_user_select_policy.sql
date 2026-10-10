-- Allow authenticated users to read their own usage_tracking rows
CREATE POLICY "Users can view own usage"
ON public.usage_tracking
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
