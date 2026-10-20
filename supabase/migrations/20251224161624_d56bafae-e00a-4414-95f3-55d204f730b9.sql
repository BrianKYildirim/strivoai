-- Create table for resume score history (tracking scores over time)
CREATE TABLE public.resume_score_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resume_score_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own score history"
ON public.resume_score_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own score history"
ON public.resume_score_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create table for user achievements
CREATE TABLE public.user_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  achievement_type TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  description TEXT,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, achievement_type)
);

-- Enable RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own achievements"
ON public.user_achievements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own achievements"
ON public.user_achievements FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX idx_resume_score_history_user ON public.resume_score_history(user_id);
CREATE INDEX idx_resume_score_history_recorded ON public.resume_score_history(recorded_at DESC);
CREATE INDEX idx_user_achievements_user ON public.user_achievements(user_id);