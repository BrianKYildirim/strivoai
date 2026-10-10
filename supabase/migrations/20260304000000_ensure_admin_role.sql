-- Ensure strivolife@gmail.com has the 'admin' role in user_roles.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.
-- Runs under service role (migration context), so RLS is bypassed.

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'strivolife@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
