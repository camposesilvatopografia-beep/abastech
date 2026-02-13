-- Create user_permissions table for individual user-level permission overrides
-- Falls back to role_permissions when no user-specific entry exists
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'system', -- 'system' or 'field'
  module_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);

-- Enable RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow public read user_permissions" ON public.user_permissions FOR SELECT USING (true);
CREATE POLICY "Allow public insert user_permissions" ON public.user_permissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update user_permissions" ON public.user_permissions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete user_permissions" ON public.user_permissions FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();