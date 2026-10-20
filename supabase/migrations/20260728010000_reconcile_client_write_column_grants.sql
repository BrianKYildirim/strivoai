-- Reconcile client-write privileges after two conflicting grant migrations:
--   20260726130000 removed all authenticated writes.
--   20260727120000 restored blanket writes, including server-owned columns.
--
-- This migration converges both states safely:
--   * environments with no table grants receive the required column grants;
--   * environments with blanket grants have them replaced by column grants.

begin;

revoke insert, update on public.resumes from authenticated;

grant insert (
  user_id,
  file_name,
  file_url,
  file_path,
  file_hash,
  file_size,
  extracted_text,
  text_hash,
  document_hash,
  extraction_version,
  extraction_metadata
) on public.resumes to authenticated;

grant update (
  file_name,
  file_url,
  file_path,
  file_hash,
  file_size,
  extracted_text,
  text_hash,
  document_hash,
  extraction_version,
  extraction_metadata
) on public.resumes to authenticated;

revoke insert, update on public.career_targets from authenticated;

grant insert (
  user_id,
  target_roles,
  target_industries,
  target_companies,
  location_preference,
  career_goals,
  professional_goal,
  professional_goal_set_at
) on public.career_targets to authenticated;

grant update (
  user_id,
  target_roles,
  target_industries,
  target_companies,
  location_preference,
  career_goals,
  professional_goal,
  professional_goal_set_at
) on public.career_targets to authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.resumes', 'INSERT')
    or has_table_privilege('authenticated', 'public.resumes', 'UPDATE') then
    raise exception 'authenticated retains blanket INSERT/UPDATE on public.resumes';
  end if;

  if not has_column_privilege('authenticated', 'public.resumes', 'file_name', 'INSERT')
    or not has_column_privilege('authenticated', 'public.resumes', 'extracted_text', 'INSERT')
    or not has_column_privilege('authenticated', 'public.resumes', 'extracted_text', 'UPDATE') then
    raise exception 'authenticated is missing required column grants on public.resumes';
  end if;

  if has_column_privilege('authenticated', 'public.resumes', 'analyzed_tier', 'INSERT')
    or has_column_privilege('authenticated', 'public.resumes', 'analyzed_tier', 'UPDATE')
    or has_column_privilege('authenticated', 'public.resumes', 'grading_data', 'INSERT')
    or has_column_privilege('authenticated', 'public.resumes', 'grading_data', 'UPDATE') then
    raise exception 'authenticated can write server-owned columns on public.resumes';
  end if;

  if has_table_privilege('authenticated', 'public.career_targets', 'INSERT')
    or has_table_privilege('authenticated', 'public.career_targets', 'UPDATE') then
    raise exception 'authenticated retains blanket INSERT/UPDATE on public.career_targets';
  end if;

  if not has_column_privilege('authenticated', 'public.career_targets', 'target_roles', 'INSERT')
    or not has_column_privilege('authenticated', 'public.career_targets', 'professional_goal', 'UPDATE') then
    raise exception 'authenticated is missing required column grants on public.career_targets';
  end if;

  if has_column_privilege('authenticated', 'public.career_targets', 'professional_goal_structured', 'INSERT')
    or has_column_privilege('authenticated', 'public.career_targets', 'professional_goal_structured', 'UPDATE')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_score', 'INSERT')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_score', 'UPDATE')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_components', 'INSERT')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_components', 'UPDATE')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_computed_at', 'INSERT')
    or has_column_privilege('authenticated', 'public.career_targets', 'goal_readiness_computed_at', 'UPDATE') then
    raise exception 'authenticated can write server-owned columns on public.career_targets';
  end if;
end
$$;

commit;
