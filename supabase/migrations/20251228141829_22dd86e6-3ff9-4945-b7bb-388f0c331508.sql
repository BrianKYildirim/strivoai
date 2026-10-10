-- Allow users to update their own analysis results
CREATE POLICY "Users can update their own analysis results"
ON public.analysis_results
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow users to delete their own analysis results
CREATE POLICY "Users can delete their own analysis results"
ON public.analysis_results
FOR DELETE
USING (auth.uid() = user_id);