-- WARNING: This rollback restores the immediate pre-repair blanket grants.
-- It preserves client onboarding writes, but reopens authenticated writes to
-- server-owned columns such as analyzed_tier and goal_readiness_score.

begin;

revoke insert, update on public.resumes from authenticated;
grant insert, update on public.resumes to authenticated;

revoke insert, update on public.career_targets from authenticated;
grant insert, update on public.career_targets to authenticated;

commit;
