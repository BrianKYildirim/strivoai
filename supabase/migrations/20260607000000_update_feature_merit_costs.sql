-- Align visible and charged Merit costs across the four primary analysis categories.
-- Resume, LinkedIn, and Career Compass cost 3 Merits on every active tier.
-- Recruiting Lens costs 8 Merits on paid tiers; free remains tier-locked by absence.

INSERT INTO public.merit_feature_costs (feature, tier, cost) VALUES
  ('resume_analysis', 'free', 3),
  ('resume_analysis', 'pro', 3),
  ('resume_analysis', 'elite', 3),
  ('linkedin_grading', 'free', 3),
  ('linkedin_grading', 'pro', 3),
  ('linkedin_grading', 'elite', 3),
  ('career_compass', 'free', 3),
  ('career_compass', 'pro', 3),
  ('career_compass', 'elite', 3),
  ('recruiting_lens', 'pro', 8),
  ('recruiting_lens', 'elite', 8)
ON CONFLICT (feature, tier) DO UPDATE
SET cost = EXCLUDED.cost;
