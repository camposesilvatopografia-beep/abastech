-- Drop the function with wrong column name and recreate with correct one
DROP FUNCTION IF EXISTS public.is_system_admin(_username text);

CREATE OR REPLACE FUNCTION public.is_system_admin(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_users
    WHERE username = _username
      AND role = 'admin'
      AND active = true
  )
$$;