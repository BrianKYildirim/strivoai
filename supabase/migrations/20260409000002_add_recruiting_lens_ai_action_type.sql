-- Extend the ai_action_type ENUM to include 'recruiting_lens'.
-- The record_ai_usage RPC uses this ENUM for p_action_type validation.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- older PostgreSQL versions. Supabase migrations run each file as its own
-- transaction, so this is safe as a standalone migration file.
ALTER TYPE public.ai_action_type ADD VALUE IF NOT EXISTS 'recruiting_lens';
