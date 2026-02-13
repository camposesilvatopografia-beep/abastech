-- Create role_permissions table for per-role menu access control
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  module_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role, module_id)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Allow public read (needed for sidebar filtering)
CREATE POLICY "Allow public read role_permissions"
ON public.role_permissions FOR SELECT
USING (true);

-- Allow public write (admin-only enforced in frontend)
CREATE POLICY "Allow public insert role_permissions"
ON public.role_permissions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update role_permissions"
ON public.role_permissions FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete role_permissions"
ON public.role_permissions FOR DELETE
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permissions for all roles
-- Admin: full access to everything
INSERT INTO public.role_permissions (role, module_id, can_view, can_edit) VALUES
  ('admin', 'dashboard', true, true),
  ('admin', 'abastecimento', true, true),
  ('admin', 'frota', true, true),
  ('admin', 'horimetros', true, true),
  ('admin', 'manutencao', true, true),
  ('admin', 'calendario', true, true),
  ('admin', 'fornecedores', true, true),
  ('admin', 'lubrificantes', true, true),
  ('admin', 'mecanicos', true, true),
  ('admin', 'tiposoleos', true, true),
  ('admin', 'usuarios', true, true),
  ('admin', 'obra', true, true),
  ('admin', 'alertas', true, true),
  ('admin', 'campo', true, true),
  ('admin', 'campo_usuarios', true, true);

-- Supervisor: view everything, edit most
INSERT INTO public.role_permissions (role, module_id, can_view, can_edit) VALUES
  ('supervisor', 'dashboard', true, true),
  ('supervisor', 'abastecimento', true, true),
  ('supervisor', 'frota', true, true),
  ('supervisor', 'horimetros', true, true),
  ('supervisor', 'manutencao', true, true),
  ('supervisor', 'calendario', true, true),
  ('supervisor', 'fornecedores', true, false),
  ('supervisor', 'lubrificantes', true, false),
  ('supervisor', 'mecanicos', true, false),
  ('supervisor', 'tiposoleos', true, false),
  ('supervisor', 'usuarios', false, false),
  ('supervisor', 'obra', true, false),
  ('supervisor', 'alertas', true, true),
  ('supervisor', 'campo', true, true),
  ('supervisor', 'campo_usuarios', true, false);

-- Operador: view basic modules only
INSERT INTO public.role_permissions (role, module_id, can_view, can_edit) VALUES
  ('operador', 'dashboard', true, false),
  ('operador', 'abastecimento', true, false),
  ('operador', 'frota', true, false),
  ('operador', 'horimetros', true, false),
  ('operador', 'manutencao', true, false),
  ('operador', 'calendario', true, false),
  ('operador', 'fornecedores', false, false),
  ('operador', 'lubrificantes', false, false),
  ('operador', 'mecanicos', false, false),
  ('operador', 'tiposoleos', false, false),
  ('operador', 'usuarios', false, false),
  ('operador', 'obra', false, false),
  ('operador', 'alertas', true, false),
  ('operador', 'campo', true, true),
  ('operador', 'campo_usuarios', false, false);