-- Extend the ai_action_type ENUM to include 'interview_prep'.
-- The record_ai_usage RPC uses this ENUM for p_action_type validation.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- Supabase migrations run each file as its own transaction, so this is safe standalone.
ALTER TYPE public.ai_action_type ADD VALUE IF NOT EXISTS 'interview_prep';
